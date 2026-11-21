import numpy as np

from app.audio import apply_fades, loop_to_duration

SR = 48000


def test_loop_reaches_exact_length():
    clip = np.random.default_rng(0).standard_normal(SR * 4).astype(np.float32) * 0.1
    for duration in (1.0, 4.0, 9.5, 30.0):
        assert len(loop_to_duration(clip, SR, duration)) == int(duration * SR)


def test_loop_keeps_level_steady_at_seam():
    """Ambience is noise-like, so start and end are uncorrelated: an equal-power crossfade must not
    create a dip or bump. Compare loudness inside the first seam with the rest of the clip."""
    rng = np.random.default_rng(1)
    clip = rng.standard_normal(SR * 4).astype(np.float32) * 0.1
    out = loop_to_duration(clip, SR, 12.0, crossfade=1.0)
    seam = out[3 * SR : 4 * SR]            # first crossfade region (clip is 4 s, crossfade 1 s)
    rest = np.concatenate([out[: 3 * SR], out[5 * SR : 7 * SR]])
    rms = lambda x: float(np.sqrt(np.mean(x**2)))
    diff_db = abs(20 * np.log10(rms(seam) / rms(rest)))
    assert diff_db < 1.0, diff_db


def test_very_short_clip_still_loops():
    out = loop_to_duration(np.ones(3, dtype=np.float32), SR, 1.0)
    assert len(out) == SR


def test_fades():
    out = apply_fades(np.ones(SR * 4, dtype=np.float32), SR, fade_in=0.5, fade_out=1.0)
    assert out[0] == 0 and out[-1] == 0 and out[SR * 2] == 1.0
