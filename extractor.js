const fs = require('fs');
const path = require('path');
const { SourceMapConsumer } = require('source-map');

async function extract(mapPath, outputDir) {
  const mapData = fs.readFileSync(mapPath, 'utf8');
  const map = JSON.parse(mapData);

  const wasmPath = require.resolve('source-map/lib/mappings.wasm');
  const wasmBuffer = fs.readFileSync(wasmPath);
  await SourceMapConsumer.initialize({
    'lib/mappings.wasm': wasmBuffer,
  });

  const consumer = await new SourceMapConsumer(map);

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  for (const sourceFile of consumer.sources) {
    const content = consumer.sourceContentFor(sourceFile);
    if (content) {
      const filePath = path.join(outputDir, sourceFile);
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, content);
      console.log(`Saved: ${filePath}`);
    } else {
      console.warn(`No content for: ${sourceFile}`);
    }
  }

  consumer.destroy();
}

const [mapPath, outputDir] = process.argv.slice(2);
if (!mapPath || !outputDir) {
  console.error('Usage: node extract.js <map-file> <output-dir>');
  process.exit(1);
}
extract(mapPath, outputDir).catch(console.error);
