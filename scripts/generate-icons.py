from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
MASTER = ROOT / "assets" / "chattidy-imagegen-master.png"
OUTPUT = ROOT / "assets" / "icons"
SIZES = (16, 32, 48, 128)


def render_icon(size: int) -> None:
    """Create a browser-ready PNG from the ImageGen 2 master artwork."""
    with Image.open(MASTER) as source:
        icon = source.convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)
    icon.save(OUTPUT / f"chattidy-{size}.png", optimize=True)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for size in SIZES:
        render_icon(size)


if __name__ == "__main__":
    main()
