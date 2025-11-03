# Assets Folder

Folder ini digunakan untuk menyimpan aset-aset aplikasi gemiprintaio.

## Struktur Folder

```
assets/
├── fonts/          # Font files (.ttf, .otf, .woff, .woff2)
├── images/         # Gambar umum (logo, banner, backgrounds, dll)
└── icons/          # Icon dan SVG files
```

## Cara Menggunakan

### Fonts

Letakkan file font di folder `fonts/` dan import di CSS/globals.css:

```css
@font-face {
  font-family: "CustomFont";
  src: url("/assets/fonts/CustomFont.ttf") format("truetype");
}
```

### Images

Letakkan gambar di folder `images/` dan gunakan di komponen:

```tsx
<Image src="/assets/images/logo.png" alt="Logo" width={200} height={100} />
```

### Icons

Letakkan icon di folder `icons/` dan gunakan langsung:

```tsx
<img src="/assets/icons/icon-name.svg" alt="Icon" />
```

## Tips Performance

1. **Optimize gambar** sebelum upload (compress dengan tools seperti TinyPNG)
2. **Gunakan WebP format** untuk gambar modern (fallback ke PNG/JPG)
3. **Lazy load** untuk gambar besar
4. **Gunakan SVG** untuk icons (lebih ringan dan scalable)
