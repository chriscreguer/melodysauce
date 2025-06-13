import json
import numpy as np
from magenta.models.music_vae import configs, TrainedModel
from magenta.music import sequences_lib, sequence_proto_to_midi_file
from magenta.protobuf import music_pb2

# 1. Load the 16-bar VAE config & weights
config = configs.CONFIG_MAP['mel_16bar_small_q2']
model = TrainedModel(
    config,
    batch_size=1,
    checkpoint_dir_or_path='models/mel_16bar_small_q2'
)

# 2. Define a simple 4-note melody stretched to 16 bars
seq = music_pb2.NoteSequence()
seq.ticks_per_quarter = 220
seq.total_time = 4.0
seq.notes.add(pitch=60, start_time=0.0, end_time=1.0)
seq.notes.add(pitch=62, start_time=1.0, end_time=2.0)
seq.notes.add(pitch=64, start_time=2.0, end_time=3.0)
seq.notes.add(pitch=65, start_time=3.0, end_time=4.0)

# 3. Quantize and encode
qns = sequences_lib.quantize_note_sequence(seq, steps_per_quarter=4)
z = model.encode([qns])

# 4. Mutate latent vector
z_mut = z + np.random.normal(0, 0.5, size=z.shape)

# 5. Decode and save as MIDI
[variant] = model.decode(z_mut)
sequence_proto_to_midi_file(variant, 'mutation.mid')
print('Wrote mutation.mid') 