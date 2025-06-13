const fs = require('fs');
const https = require('https');
const path = require('path');

const BASE_URL =
  'https://storage.googleapis.com/download.magenta.tensorflow.org/tfjs_checkpoints/' +
  'music_vae/mel_16bar_small_q2/';

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200)
        return reject(new Error(`Failed to ${url}: ${res.statusCode}`));
      res.pipe(fs.createWriteStream(dest))
         .on('finish', resolve)
         .on('error', reject);
    }).on('error', reject);
  });
}

(async () => {
  const modelDir = path.join(__dirname, 'models', 'mel_16bar_small_q2');
  fs.mkdirSync(modelDir, { recursive: true });

  // 1) Grab the manifest and config
  console.log('Downloading config.json and weights_manifest.json…');
  await download(BASE_URL + 'config.json', path.join(modelDir, 'config.json'));
  await download(BASE_URL + 'weights_manifest.json',
                 path.join(modelDir, 'weights_manifest.json'));

  // 2) Read shards list from the manifest
  const manifest = JSON.parse(
    fs.readFileSync(path.join(modelDir, 'weights_manifest.json'))
  );
  const shardFiles = manifest[0].paths;

  // 3) Download each .bin shard
  for (const shard of shardFiles) {
    console.log('Downloading', shard);
    await download(BASE_URL + shard, path.join(modelDir, shard));
  }

  console.log('✅ All files downloaded to', modelDir);
})(); 