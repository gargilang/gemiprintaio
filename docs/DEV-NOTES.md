# gemiprint - Development Notes

## 🚀 Quick Start

```bash
npm install
npm run dev
```

Buka: http://localhost:3000

## 🔐 Demo Login

**Admin:**

- Username: `admin`
- Password: `admin123`

**User:**

- Username: `user`
- Password: `user123`

## 🎨 Features

### ✅ Implemented

- **Glassmorphism UI** - Cards transparan dengan backdrop blur
- **Light/Dark Theme** - Toggle di header (icon sun/moon)
- **Background Biru Cerah** - Gradient sky-blue untuk light mode
- **Branding Konsisten** - "gemiprint" lowercase
- **Mock Authentication** - Login tanpa database untuk development
- **SQLite Ready** - better-sqlite3 installed
- **Tauri Ready** - Config sudah siap untuk dibungkus

### ⏳ Pending (After Tauri Integration)

- SQLite authentication (menggantikan mock login)
- Sync functionality
- Offline database operations
- Desktop app packaging

## 🎯 Next Steps

1. **Initialize Tauri**

   ```bash
   npm install -g @tauri-apps/cli
   cargo tauri init
   ```

2. **Configure Tauri for Next.js**

   - Set distDir to `out`
   - Set devPath to `http://localhost:3000`

3. **Implement SQLite Backend**

   - Move auth logic to Tauri commands
   - Implement database operations
   - Add sync logic

4. **Build Desktop App**
   ```bash
   npm run tauri:build
   ```

## 📝 Technical Details

### Stack

- **Framework**: Next.js 16 (Static Export)
- **Database**: SQLite (better-sqlite3)
- **Desktop**: Tauri 2.x
- **Styling**: Tailwind CSS 4
- **Language**: TypeScript

### Current Mode

- Static export enabled (`output: "export"`)
- API routes disabled (not compatible with static export)
- Mock authentication for development
- localStorage for session management

### Theme System

- CSS variables untuk colors
- Tailwind `dark:` classes
- Theme disimpan di localStorage
- Toggle animation smooth

## 🐛 Known Issues (Fixed)

- ✅ JSON parse error - Fixed dengan mock login
- ✅ Dark theme tidak berubah - Fixed dengan `.dark` class
- ✅ API routes error - Disabled untuk static export

## 🎨 Color Palette

```css
--navy: #0a1b3d
--blue: #2266ff
--cyan: #2fd3ff
--magenta: #ff2f91
--yellow: #ffd400
--gemi: #00afef
```

### Light Theme

- Background: Gradient biru cerah (sky-200 → blue-300 → cyan-200)
- Glass: rgba(255, 255, 255, 0.4) + backdrop-blur-xl

### Dark Theme

- Background: Gradient navy gelap
- Glass: rgba(10, 27, 61, 0.4) + backdrop-blur-xl
