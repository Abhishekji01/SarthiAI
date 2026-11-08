from common import clip


def test_clip_keeps_short_text():
    assert clip("Competitive stipend and stay.", 100) == "Competitive stipend and stay."


def test_clip_cuts_at_a_word_boundary_with_ellipsis():
    out = clip("Competitive stipend and stay provided for selected students", 28)
    assert out == "Competitive stipend and…"
    assert len(out) <= 28


def test_clip_handles_empty():
    assert clip(None, 10) == ""
    assert clip("", 10) == ""
