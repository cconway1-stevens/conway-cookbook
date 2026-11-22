#!/usr/bin/env python3
"""Import a public recipe page's structured data into the cookbook."""

import argparse
from concurrent.futures import Future, TimeoutError as DeadlineExceeded
from decimal import Decimal
import hashlib
from html.parser import HTMLParser
import http.client
import ipaddress
import json
import math
import os
from pathlib import Path
import re
import socket
import ssl
import sys
import tempfile
import threading
import unicodedata
from urllib.parse import quote, urljoin, urlsplit, urlunsplit


CONFIG = Path("src/data/cookbook.json")
RECIPES = Path("src/content/recipes")
MAX_BODY = 5 * 1024 * 1024
MAX_REDIRECTS = 5
SOCKET_TIMEOUT = 8
FETCH_TIMEOUT = 30
REDIRECTS = {301, 302, 303, 307, 308}
URL_WHITESPACE = re.compile(r"[\s\x00-\x1f\x7f]")
AUTHORITY = re.compile(r"(?:\[[0-9A-Fa-f:.]+\]|[^\[\]:@%\\]+)(?::443)?\Z")
DNS_LABEL = re.compile(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\Z")
# Do not allow IPv6 transition addresses that can embed another destination.
IPV6_TRANSITION = tuple(map(ipaddress.ip_network, (
    "::ffff:0:0/96", "64:ff9b::/96", "64:ff9b:1::/48", "2001::/32", "2002::/16",
)))


class ImportFailure(Exception):
    pass


def https_target(url):
    invalid = "Use a public HTTPS URL without credentials or a custom port."
    if URL_WHITESPACE.search(url):
        raise ImportFailure(invalid)
    try:
        parts = urlsplit(url)
        if parts.scheme != "https" or not AUTHORITY.fullmatch(parts.netloc):
            raise ImportFailure(invalid)
        host = parts.hostname
        if parts.netloc.startswith("["):
            host = str(ipaddress.IPv6Address(host))
            authority = f"[{host}]"
        else:
            host = host.encode("idna").decode("ascii").lower().removesuffix(".")
            if len(host) > 253 or not all(DNS_LABEL.fullmatch(label) for label in host.split(".")):
                raise ImportFailure(invalid)
            authority = host
        path = quote(parts.path or "/", safe="/%:@!$&'()*+,;=-._~")
        query = quote(parts.query, safe="/%?:@!$&'()*+,;=-._~")
    except (UnicodeError, ValueError) as exc:
        raise ImportFailure(invalid) from exc
    return urlunsplit(("https", authority, path, query, "")), host, path + (f"?{query}" if query else "")


def public_addresses(host):
    try:
        answers = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise ImportFailure("Could not resolve the recipe host.") from exc
    addresses = []
    for family, _, _, _, address in answers:
        ip = ipaddress.ip_address(address[0])
        if (family not in {socket.AF_INET, socket.AF_INET6} or not ip.is_global or ip.is_multicast
                or ip.is_reserved or (ip.version == 6 and (
                    ip.is_site_local or address[3] or any(ip in network for network in IPV6_TRANSITION)))):
            raise ImportFailure("The recipe host resolves to a nonpublic address.")
        addresses.append((family, address))
    if not addresses:
        raise ImportFailure("The recipe host has no public address.")
    return addresses


class PinnedHTTPS(http.client.HTTPSConnection):
    def __init__(self, host, addresses, context):
        super().__init__(host, port=443, timeout=SOCKET_TIMEOUT, context=context)
        self.addresses = addresses
        self.tls = context

    def connect(self):
        # Connect to the vetted sockaddr, not the hostname. TLS still verifies the original host.
        last_error = None
        for family, address in self.addresses:
            with socket.socket(family, socket.SOCK_STREAM, socket.IPPROTO_TCP) as connection:
                connection.settimeout(self.timeout)
                try:
                    connection.connect(address)
                except OSError as exc:
                    last_error = exc
                    continue
                self.sock = self.tls.wrap_socket(connection, server_hostname=self.host)
                return
        raise last_error


def download(url):
    context = ssl.create_default_context()
    for hop in range(MAX_REDIRECTS + 1):
        url, host, target = https_target(url)
        connection = PinnedHTTPS(host, public_addresses(host), context)
        try:
            connection.request("GET", target, headers={
                "Accept": "text/html, application/xhtml+xml",
                "Accept-Encoding": "identity",
                "User-Agent": "ConwayCookbookRecipeImporter/1.0",
            })
            with connection.getresponse() as response:
                if response.status in REDIRECTS:
                    location = response.getheader("Location")
                    if not location or not location.strip():
                        raise ImportFailure("The page returned a redirect without a location.")
                    if hop == MAX_REDIRECTS:
                        raise ImportFailure("The page returned too many redirects.")
                    # Validate again before DNS, even for a redirect to the same host.
                    if URL_WHITESPACE.search(location):
                        raise ImportFailure("The page returned an invalid redirect location.")
                    try:
                        url = urljoin(url, location)
                    except ValueError as exc:
                        raise ImportFailure("The page returned an invalid redirect location.") from exc
                    continue
                if response.status != 200:
                    raise ImportFailure(f"The page returned HTTP {response.status}.")
                if response.headers.get_content_type() not in {"text/html", "application/xhtml+xml"}:
                    raise ImportFailure("The URL did not return an HTML page.")
                if response.getheader("Content-Encoding", "identity").strip().lower() != "identity":
                    raise ImportFailure("The page returned an unsupported content encoding.")
                if response.length is not None and response.length > MAX_BODY:
                    raise ImportFailure("The page exceeds the 5 MiB download limit.")
                body = response.read(MAX_BODY + 1)
                if len(body) > MAX_BODY:
                    raise ImportFailure("The page exceeds the 5 MiB download limit.")
                try:
                    return body.decode(response.headers.get_content_charset() or "utf-8", errors="replace"), url, host
                except LookupError as exc:
                    raise ImportFailure("The page uses an unsupported text encoding.") from exc
        finally:
            connection.close()


def fetch(url):
    # Socket timeouts alone do not bound DNS or a slowly trickled response.
    result = Future()

    def request():
        try:
            result.set_result(download(url))
        except Exception as exc:
            result.set_exception(exc)

    threading.Thread(target=request, daemon=True).start()
    try:
        return result.result(timeout=FETCH_TIMEOUT)
    except (DeadlineExceeded, TimeoutError) as exc:
        raise ImportFailure("The recipe page request timed out.") from exc
    except ssl.SSLError as exc:
        raise ImportFailure("Could not verify a secure connection to the recipe host.") from exc
    except (OSError, http.client.HTTPException) as exc:
        raise ImportFailure("Could not download the recipe page.") from exc


class RecipePage(HTMLParser):
    def __init__(self):
        super().__init__()
        self.scripts = []
        self.script = None
        self.site_name = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "script" and (attrs.get("type") or "").split(";", 1)[0].strip().lower() == "application/ld+json":
            self.script = []
        elif tag == "meta" and (attrs.get("property") or attrs.get("name") or "").lower() == "og:site_name":
            self.site_name = self.site_name or attrs.get("content")

    def handle_data(self, data):
        if self.script is not None:
            self.script.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self.script is not None:
            self.scripts.append("".join(self.script))
            self.script = None


class TextContent(HTMLParser):
    BREAKS = {"br", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "ol", "p", "ul"}

    def __init__(self):
        super().__init__()
        self.parts = []
        self.ignored = None

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style"}:
            self.ignored = tag
        elif tag in self.BREAKS:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if self.ignored == tag:
            self.ignored = None
        elif tag in self.BREAKS:
            self.parts.append("\n")

    def handle_data(self, data):
        if self.ignored is None:
            self.parts.append(data)


def text_lines(value):
    if not isinstance(value, str):
        return []
    if "<" in value or "&" in value:
        parser = TextContent()
        try:
            parser.feed(value)
            parser.close()
        except AssertionError as exc:
            raise ImportFailure("Recipe metadata contains malformed markup.") from exc
        value = "".join(parser.parts)
    value = "".join(char for char in value if char.isspace() or unicodedata.category(char) not in {"Cc", "Cs"})
    return [line for raw in value.splitlines() if (line := " ".join(raw.split()))]


def text(value):
    return " ".join(text_lines(value))


def has_type(node, name):
    types = node.get("@type")
    if not isinstance(types, list):
        types = [types]
    return any(kind in (name, f"schema:{name}", f"https://schema.org/{name}", f"http://schema.org/{name}")
               for kind in types)


def recipe_nodes(root):
    pending = [root]
    while pending:
        node = pending.pop()
        if isinstance(node, list):
            pending.extend(reversed(node))
        elif isinstance(node, dict):
            if has_type(node, "Recipe"):
                yield node
            pending.extend([node.get("@graph"), node.get("mainEntity")])


def instructions(value):
    steps = []
    pending = [value]
    while pending:
        node = pending.pop()
        if isinstance(node, list):
            pending.extend(reversed(node))
        elif isinstance(node, str):
            steps.extend(text_lines(node))
        elif isinstance(node, dict):
            if has_type(node, "HowToSection"):
                pending.append(node.get("itemListElement"))
            elif has_type(node, "HowToStep") or has_type(node, "HowToDirection"):
                body = text(node.get("text"))
                title = text(node.get("name")).rstrip(".")
                if body:
                    steps.append({"title": title, "text": body} if title and title != body.rstrip(".") else body)
                else:
                    pending.append(node.get("itemListElement"))
    return steps


DURATION_NUMBER = r"[0-9]{1,9}(?:[.,][0-9]{1,9})?"
DURATION = re.compile(rf"P(?:(?P<weeks>{DURATION_NUMBER})W|(?:(?P<days>{DURATION_NUMBER})D)?"
                      rf"(?:T(?:(?P<hours>{DURATION_NUMBER})H)?(?:(?P<minutes>{DURATION_NUMBER})M)?"
                      rf"(?:(?P<seconds>{DURATION_NUMBER})S)?)?)\Z")
SECONDS = {"weeks": 604800, "days": 86400, "hours": 3600, "minutes": 60, "seconds": 1}
WORD_DURATION = re.compile(r"([0-9]{1,6})\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?)\.?", re.I)
WORD_SECONDS = {"s": 1, "m": 60, "h": 3600, "d": 86400}


def duration(value):
    if not isinstance(value, str):
        return None
    value = value.strip()
    if words := WORD_DURATION.fullmatch(value):
        return int(words[1]) * WORD_SECONDS[words[2][0].lower()]
    match = DURATION.fullmatch(value)
    if not match or value.endswith("T"):
        return None
    parts = [(unit, amount.replace(",", ".")) for unit, amount in match.groupdict().items() if amount]
    if not parts or any("." in amount for _, amount in parts[:-1]):
        return None
    return math.ceil(sum(Decimal(amount) * SECONDS[unit] for unit, amount in parts))


def display_duration(seconds):
    parts = []
    for unit, size in SECONDS.items():
        count, seconds = divmod(seconds, size)
        if count:
            parts.append(f"{count} {unit if count != 1 else unit[:-1]}")
    return " ".join(parts)


def recipe_time(node):
    values = [node.get(key) for key in ("totalTime", "prepTime", "cookTime")]
    total, prep, cook = map(duration, values)
    if not total and prep is not None and cook is not None:
        total = prep + cook
    if total:
        return {"time": display_duration(total), "minutes": (total + 59) // 60}
    if label := text(values[0]):
        return {"time": label}
    parts = []
    for value, seconds, kind in zip(values[1:], (prep, cook), ("prep", "cook")):
        label = display_duration(seconds) if seconds else text(value)
        if label:
            parts.append(f"{label} {kind}")
    return {"time": ", ".join(parts) or "Not listed by source"}


def yield_amount(value):
    if isinstance(value, str):
        return text(value)
    if type(value) is int or (type(value) is float and math.isfinite(value)):
        return str(value) if value > 0 else ""
    return ""


def yield_text(value):
    if isinstance(value, dict) and has_type(value, "QuantitativeValue"):
        amount = yield_amount(value.get("value"))
        if not amount:
            low = yield_amount(value.get("minValue"))
            high = yield_amount(value.get("maxValue"))
            if low and high:
                amount = f"{low}–{high}" if low != high else low
        if amount:
            return " ".join(filter(None, (amount, text(value.get("unitText")))))
    return yield_amount(value)


def recipe_yield(value):
    values = value if isinstance(value, list) else [value]
    for item in values:
        if servings := yield_text(item):
            return servings
    if any(item is not None and not (isinstance(item, str) and not text(item)) for item in values):
        raise ImportFailure("Recipe yield uses unsupported metadata.")
    return "Not listed by source"


def convert(node, category, url, site_name):
    title = text(node.get("name"))
    if not title:
        raise ImportFailure("Recipe metadata is missing a title.")
    raw_ingredients = node.get("recipeIngredient")
    if not isinstance(raw_ingredients, list):
        raw_ingredients = [raw_ingredients]
    ingredients = [line for item in raw_ingredients for line in text_lines(item)]
    if not ingredients:
        raise ImportFailure("Recipe metadata has no usable ingredient lines.")
    steps = instructions(node.get("recipeInstructions"))
    if not steps:
        raise ImportFailure("Recipe metadata has no usable instructions.")
    publisher = node.get("publisher")
    source_name = (text(publisher.get("name")) if isinstance(publisher, dict) else text(publisher)) or site_name
    description = text(node.get("description")) or f"Recipe from {source_name}."
    if len(description) > 240:
        description = description[:239].rsplit(" ", 1)[0] + "…"
    return {
        "title": title,
        "description": description,
        "category": category,
        **recipe_time(node),
        "servings": recipe_yield(node.get("recipeYield")),
        "ingredients": ingredients,
        "steps": steps,
        "source": {"name": source_name, "url": url},
    }


def extract(html, url, host, category):
    page = RecipePage()
    try:
        page.feed(html)
        page.close()
    except AssertionError as exc:
        raise ImportFailure("Could not parse the recipe page HTML.") from exc
    site_name = text(page.site_name) or host.removeprefix("www.")
    first_failure = None
    malformed = False
    for script in page.scripts:
        try:
            root = json.loads(script.lstrip("\ufeff"))
        except (ValueError, RecursionError):
            malformed = True
            continue
        for node in recipe_nodes(root):
            try:
                return convert(node, category, url, site_name)
            except ImportFailure as exc:
                first_failure = first_failure or str(exc)
    if first_failure:
        raise ImportFailure(first_failure)
    if malformed:
        raise ImportFailure("No Recipe was found in valid JSON-LD; the page contains malformed JSON-LD.")
    raise ImportFailure("The page does not contain Schema.org Recipe JSON-LD.")


def validate_category(category):
    try:
        config = json.loads(CONFIG.read_text(encoding="utf-8"))
        categories = list(dict.fromkeys([course["name"] for course in config["courses"]] + config["meals"]))
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise ImportFailure("Could not read cookbook categories; run this command from the repository root.") from exc
    if category not in categories:
        raise ImportFailure("Choose a cookbook category: " + ", ".join(categories) + ".")


def save(recipe):
    title = recipe["title"]
    normalized = unicodedata.normalize("NFKD", title).casefold()
    slug = re.sub(r"[^a-z0-9]+", "-", "".join(char for char in normalized if not unicodedata.combining(char)))
    slug = slug.strip("-")[:100].rstrip("-") or "recipe-" + hashlib.sha256(title.encode("utf-8")).hexdigest()[:12]
    target = RECIPES / f"{slug}.json"
    temporary = None
    try:
        if any(path.suffix.lower() in {".json", ".md"} and path.stem.casefold() == slug
               for path in RECIPES.rglob("*")):
            raise ImportFailure(f"A recipe named {slug} already exists.")
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=RECIPES, prefix=".recipe-",
                                         suffix=".tmp", delete=False) as file:
            temporary = Path(file.name)
            json.dump(recipe, file, ensure_ascii=False, indent=2)
            file.write("\n")
        # The complete file becomes visible atomically, without replacing an existing path.
        os.link(temporary, target)
    except FileExistsError as exc:
        raise ImportFailure(f"A recipe named {slug} already exists.") from exc
    except OSError as exc:
        raise ImportFailure("Could not write the recipe file.") from exc
    finally:
        if temporary is not None:
            try:
                temporary.unlink(missing_ok=True)
            except OSError as exc:
                raise ImportFailure("Could not remove the recipe staging file.") from exc
    return target.as_posix()


class Arguments(argparse.ArgumentParser):
    def error(self, message):
        # ArgumentParser may echo a mistyped URL, including its credentials.
        self.exit(2, "import-recipe: expected --url URL --category CATEGORY; see --help.\n")


def main():
    parser = Arguments(description=__doc__)
    parser.add_argument("--url", required=True, help="public HTTPS recipe page")
    parser.add_argument("--category", required=True, help="course or meal from the cookbook configuration")
    args = parser.parse_args()
    try:
        validate_category(args.category)
        html, url, host = fetch(args.url)
        print(save(extract(html, url, host, args.category)))
    except ImportFailure as exc:
        print(f"import-recipe: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("import-recipe: interrupted.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
