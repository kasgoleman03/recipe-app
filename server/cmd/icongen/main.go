// icongen writes placeholder PNG icons for the PWA manifest.
//
// Why: most browsers happily accept the bundled icon.svg, but several
// OS-level integrations (iOS home screen, Lighthouse maskable check)
// still want PNGs. Rather than bake binary blobs into the repo, this
// tiny pure-Go tool renders simple icons from primitives. Run with:
//
//	go run ./cmd/icongen ../client/public
package main

import (
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"os"
	"path/filepath"
)

type rgba struct{ r, g, b, a uint8 }

func col(r, g, b uint8) color.NRGBA { return color.NRGBA{R: r, G: g, B: b, A: 255} }

// Warm Kitchen palette (matches the CSS tokens).
var (
	terracotta = col(0xC7, 0x5B, 0x39)
	cream      = col(0xFA, 0xF6, 0xF0)
)

func main() {
	out := "."
	if len(os.Args) > 1 {
		out = os.Args[1]
	}
	if err := os.MkdirAll(out, 0o755); err != nil {
		panic(err)
	}
	for _, sz := range []int{192, 512, 180} {
		name := fmt.Sprintf("icon-%d.png", sz)
		if sz == 180 {
			name = "apple-touch-icon.png"
		}
		if err := writeIcon(filepath.Join(out, name), sz); err != nil {
			panic(err)
		}
		fmt.Println("wrote", name)
	}
}

// writeIcon renders a simple chef-hat-on-terracotta icon at the given
// square size and saves it as PNG. The hat is built from two filled
// rectangles + a half-disc; small but recognizable at any size.
func writeIcon(path string, size int) error {
	img := image.NewNRGBA(image.Rect(0, 0, size, size))

	// Rounded background ~22% radius (matches the manifest's iOS feel).
	r := int(float64(size) * 0.22)
	fillRoundedRect(img, image.Rect(0, 0, size, size), r, terracotta)

	// Hat geometry, all expressed as ratios so it scales.
	cx := size / 2
	hatTop := int(float64(size) * 0.20)
	hatRadius := int(float64(size) * 0.30)
	bandTop := int(float64(size) * 0.62)
	bandHeight := int(float64(size) * 0.13)
	bandLeft := int(float64(size) * 0.30)
	bandRight := int(float64(size) * 0.70)

	// Cloud-like top: half disc.
	fillCircle(img, cx, hatTop+hatRadius, hatRadius, cream)
	fillCircle(img, cx-int(float64(size)*0.16), hatTop+hatRadius+int(float64(size)*0.03), int(float64(size)*0.18), cream)
	fillCircle(img, cx+int(float64(size)*0.16), hatTop+hatRadius+int(float64(size)*0.03), int(float64(size)*0.18), cream)
	fillRect(img, image.Rect(cx-hatRadius-int(float64(size)*0.02), hatTop+hatRadius, cx+hatRadius+int(float64(size)*0.02), bandTop), cream)

	// Band.
	fillRoundedRect(img, image.Rect(bandLeft, bandTop, bandRight, bandTop+bandHeight), int(float64(size)*0.04), cream)

	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	return png.Encode(f, img)
}

func fillRect(img draw.Image, r image.Rectangle, c color.Color) {
	draw.Draw(img, r, &image.Uniform{C: c}, image.Point{}, draw.Src)
}

func fillRoundedRect(img *image.NRGBA, r image.Rectangle, radius int, c color.NRGBA) {
	fillRect(img, r, c)
	if radius <= 0 {
		return
	}
	// Carve out four rounded corners by writing transparent pixels in
	// the corners outside the rounded radius. Naive but fine for tiny icons.
	bg := color.NRGBA{}
	cs := []image.Point{
		{X: r.Min.X + radius, Y: r.Min.Y + radius}, // TL
		{X: r.Max.X - radius, Y: r.Min.Y + radius}, // TR
		{X: r.Min.X + radius, Y: r.Max.Y - radius}, // BL
		{X: r.Max.X - radius, Y: r.Max.Y - radius}, // BR
	}
	for cornerIdx, cp := range cs {
		for y := r.Min.Y; y < r.Max.Y; y++ {
			for x := r.Min.X; x < r.Max.X; x++ {
				inCornerBox := false
				switch cornerIdx {
				case 0:
					inCornerBox = x < r.Min.X+radius && y < r.Min.Y+radius
				case 1:
					inCornerBox = x >= r.Max.X-radius && y < r.Min.Y+radius
				case 2:
					inCornerBox = x < r.Min.X+radius && y >= r.Max.Y-radius
				case 3:
					inCornerBox = x >= r.Max.X-radius && y >= r.Max.Y-radius
				}
				if !inCornerBox {
					continue
				}
				dx := x - cp.X
				dy := y - cp.Y
				if dx*dx+dy*dy > radius*radius {
					img.Set(x, y, bg)
				}
			}
		}
	}
}

func fillCircle(img *image.NRGBA, cx, cy, r int, c color.NRGBA) {
	for y := cy - r; y <= cy+r; y++ {
		for x := cx - r; x <= cx+r; x++ {
			dx := x - cx
			dy := y - cy
			if dx*dx+dy*dy <= r*r {
				if x >= 0 && y >= 0 && x < img.Bounds().Dx() && y < img.Bounds().Dy() {
					img.Set(x, y, c)
				}
			}
		}
	}
}

// rgba is currently unused but kept so future palette tweaks can pass alpha cleanly.
var _ = rgba{}
