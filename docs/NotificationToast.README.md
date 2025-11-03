# NotificationToast Component

Komponen notifikasi yang konsisten di seluruh aplikasi dengan design transparan, soft, dan modern.

## Design Features

- ✨ Background transparan dengan border (soft look)
- 🎨 Warna hijau untuk success, merah untuk error
- 📍 Fixed position di tengah atas layar
- ⚡ Animasi fade-in dan slide-in
- 🔔 Icon otomatis (✓ untuk success, ✕ untuk error)

## Usage

### 1. Import komponen dan type

```tsx
import NotificationToast, {
  NotificationToastProps,
} from "@/components/NotificationToast";
```

### 2. Setup state di component

```tsx
const [notice, setNotice] = useState<NotificationToastProps | null>(null);
```

### 3. Buat helper function untuk show message

```tsx
const showMsg = (type: "success" | "error", message: string) => {
  setNotice({ type, message });
  setTimeout(() => setNotice(null), 3000); // Auto hide setelah 3 detik
};
```

### 4. Render komponen di JSX

```tsx
return (
  <div>
    {/* Notification Toast */}
    {notice && (
      <NotificationToast type={notice.type} message={notice.message} />
    )}

    {/* Rest of your component */}
  </div>
);
```

### 5. Gunakan showMsg di event handlers

```tsx
const handleSubmit = async () => {
  try {
    // Your logic here
    showMsg("success", "✓ Data berhasil disimpan!");
  } catch (error) {
    showMsg("error", "❌ Terjadi kesalahan!");
  }
};
```

## Example dengan MainShell

Jika menggunakan `MainShell`, notice sudah di-handle otomatis:

```tsx
import MainShell from "@/components/MainShell";
import { NotificationToastProps } from "@/components/NotificationToast";

export default function MyPage() {
  const [notice, setNotice] = useState<NotificationToastProps | null>(null);

  const showMsg = (type: "success" | "error", message: string) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 3000);
  };

  return (
    <MainShell title="My Page" notice={notice}>
      {/* Your page content */}
    </MainShell>
  );
}
```

## Props

| Prop      | Type                   | Required | Description                                      |
| --------- | ---------------------- | -------- | ------------------------------------------------ |
| `type`    | `"success" \| "error"` | ✅       | Type notifikasi (success = hijau, error = merah) |
| `message` | `string`               | ✅       | Pesan yang ditampilkan                           |

## Style Classes

- **Success**: `bg-green-50 text-green-800 border-green-200`
- **Error**: `bg-red-50 text-red-800 border-red-200`

## Pages yang Sudah Menggunakan

- ✅ `/finance` - Keuangan (via MainShell)
- ✅ `/users` - Manajemen User (direct usage)

## Tips

1. **Auto Hide**: Set timeout 2500-3000ms untuk user experience yang baik
2. **Message Format**: Gunakan emoji di awal pesan untuk visual yang lebih menarik
   - Success: `✓`, `✔️`, `🎉`, `✅`
   - Error: `❌`, `✕`, `⚠️`, `🚫`
3. **Keep Messages Short**: Maksimal 1-2 kalimat untuk readability
4. **User-Friendly**: Gunakan bahasa yang mudah dipahami user

## Migration dari Style Lama

Jika halaman masih menggunakan style lama (`bg-green-600`, `bg-red-600`):

**Before:**

```tsx
{
  notice && (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-xl shadow-lg text-white bg-green-600">
      {notice.message}
    </div>
  );
}
```

**After:**

```tsx
import NotificationToast, {
  NotificationToastProps,
} from "@/components/NotificationToast";

const [notice, setNotice] = useState<NotificationToastProps | null>(null);

{
  notice && <NotificationToast type={notice.type} message={notice.message} />;
}
```
