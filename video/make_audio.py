"""Trilha sintetizada para a animação: pulso grave constante e um clunk de carimbo nos cortes."""
import math, random, wave, struct, sys
SR = 44100
DUR = float(sys.argv[1]) if len(sys.argv) > 1 else 39.6
n = int(SR * DUR)
buf = [0.0] * n
random.seed(7)

def add(start, length, fn, gain):
    i0 = int(start * SR)
    for k in range(int(length * SR)):
        i = i0 + k
        if 0 <= i < n:
            buf[i] += gain * fn(k / SR, k)

def pulse(t, k):  # bumbo grave com decaimento
    f = 55 * (1 + 2.5 * math.exp(-t * 30))
    return math.sin(2 * math.pi * f * t) * math.exp(-t * 9)

def clunk(t, k):  # carimbo: ruído curto filtrado + tom metálico
    noise = random.uniform(-1, 1) * math.exp(-t * 60)
    tone = math.sin(2 * math.pi * 240 * t) * math.exp(-t * 22)
    return 0.6 * noise + 0.5 * tone

def tick(t, k):  # pequeno clique de dado
    return random.uniform(-1, 1) * math.exp(-t * 350) * 0.4

# Pulso constante a 96 BPM, mais leve no início
bpm_step = 60 / 96
t = 1.0
while t < DUR - 0.5:
    add(t, 0.25, pulse, 0.45)
    t += bpm_step
# Clunks nos cortes e nos carimbos principais
for s in [4.6, 12.0, 17.4, 23.6, 30.0, 35.0]:
    add(s, 0.4, clunk, 0.55)
for s in [5.2, 5.9, 6.6, 7.3, 8.0, 8.8, 9.5, 10.2, 10.9, 11.5]:
    add(s, 0.15, tick, 0.5)
add(0.3, 0.5, clunk, 0.35)

peak = max(abs(x) for x in buf) or 1
with wave.open('audio.wav', 'w') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    frames = b''.join(struct.pack('<h', int(max(-1, min(1, x / peak * 0.85)) * 32767)) for x in buf)
    w.writeframes(frames)
print('audio.wav', DUR, 's')
