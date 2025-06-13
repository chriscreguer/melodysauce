import os
import requests

BASE_URL = 'https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/mel_16bar_small_q2/'
FILES = [
    'config.json',
    'weights_manifest.json',
    'group1-shard1of6',
    'group1-shard2of6',
    'group1-shard3of6',
    'group1-shard4of6',
    'group1-shard5of6',
    'group1-shard6of6',
]

def download(url, dest):
    r = requests.get(url, stream=True)
    if r.status_code == 200:
        with open(dest, 'wb') as f:
            for chunk in r.iter_content(1024):
                f.write(chunk)
        print(f'Downloaded {dest}')
    else:
        print(f'Failed to download {url} ({r.status_code})')

os.makedirs('models/mel_16bar_small_q2', exist_ok=True)
for fname in FILES:
    download(BASE_URL + fname, f'models/mel_16bar_small_q2/{fname}') 