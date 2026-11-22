// Wraps each "## Heading" and what follows it in a <section>, so ingredients
// and directions can sit side by side.
const text = (node) => node.value ?? (node.children ?? []).map(text).join('');

export default function rehypeSections() {
  return (tree) => {
    const out = [];
    let section;
    for (const node of tree.children) {
      if (node.type === 'element' && node.tagName === 'h2') {
        const name = text(node).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        node.properties.id ??= name;
        section = { type: 'element', tagName: 'section', properties: { className: ['sec', `sec-${name}`] }, children: [] };
        out.push(section);
      }
      (section ? section.children : out).push(node);
    }
    tree.children = out;
  };
}
