// Every .css file in this folder is bundled. The list people pick from is in src/data/cookbook.json.
export default import.meta.glob('./*.css', { eager: true });
