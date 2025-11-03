# Timezone Handling Documentation

## Problem Statement

gemiprintaio adalah aplikasi yang akan digunakan di Jakarta, Indonesia (WIB/UTC+7), tetapi developer mungkin berada di timezone berbeda (contoh: Tampa, Florida EST/UTC-5).

Tanpa timezone handling yang proper, bisa terjadi:

- Tanggal bergeser ±1 hari saat input/display
- Inkonsistensi data antara developer dan user
- Bug yang sulit direproduksi karena timezone dependency

## Solution Architecture

### 1. Date Storage Strategy

**Database Format:** `YYYY-MM-DD` (string)

- Disimpan sebagai "calendar date" tanpa timezone
- Contoh: `"2025-11-02"` selalu berarti 2 November 2025
- Tidak ada ISO timestamp untuk tanggal transaksi

**Keuntungan:**

- Timezone-agnostic: tidak terpengaruh timezone server/client
- Konsisten di semua sistem
- Mudah di-query dan di-sort
- Sesuai standard SQL DATE type

### 2. Date Input Handling

**Default Value:**

```typescript
getTodayJakarta(); // Returns current date in Jakarta as "YYYY-MM-DD"
```

**HTML Input:**

```html
<input type="date" value="2025-11-02" />
```

Browser akan display dalam format lokal user, tapi value tetap `YYYY-MM-DD`

### 3. Date Display Handling

**Function:** `formatDateJakarta(dateString: string)`

**How it works:**

```typescript
// Input: "2025-11-02"
// Parse as Jakarta date
const [year, month, day] = "2025-11-02".split("-"); // [2025, 11, 2]

// Create UTC date at noon Jakarta time (05:00 UTC)
const date = new Date(Date.UTC(2025, 10, 2, 5, 0, 0));

// Format with Jakarta timezone
Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Jakarta",
}).format(date);

// Output: "02 Nov 2025"
```

**Why noon Jakarta time (05:00 UTC)?**

- Avoids edge cases around midnight
- Ensures date never shifts ±1 day due to timezone conversion
- 12:00 Jakarta = 05:00 UTC (Jakarta is UTC+7)

### 4. Test Scenarios

#### Scenario 1: Developer in Tampa (EST, UTC-5)

```
Developer time: Nov 1, 2025 11:00 PM EST
Jakarta time:   Nov 2, 2025 11:00 AM WIB

Developer inputs date: 2025-11-02
Saved to DB:          "2025-11-02"
Displayed to user:    "02 Nov 2025" ✓
```

#### Scenario 2: User in Jakarta (WIB, UTC+7)

```
Jakarta time: Nov 2, 2025 08:00 AM WIB

User inputs date:    2025-11-02
Saved to DB:        "2025-11-02"
Displayed to user:  "02 Nov 2025" ✓
```

#### Scenario 3: User in Different Timezone (e.g., Tokyo UTC+9)

```
Tokyo time: Nov 2, 2025 10:00 AM JST

User inputs date:    2025-11-02
Saved to DB:        "2025-11-02"
Displayed to user:  "02 Nov 2025" (formatted as Jakarta) ✓
```

### 5. Recalculation Logic

Saat delete transaksi, system recalculate semua transaksi berdasarkan:

```sql
ORDER BY tanggal ASC, created_at ASC
```

**String comparison untuk tanggal:**

```
"2025-11-01" < "2025-11-02" < "2025-11-03"
```

Ini bekerja sempurna karena format YYYY-MM-DD secara natural sortable.

### 6. Utility Functions

**Location:** `src/lib/date-utils.ts`

| Function                      | Purpose                         | Example                     |
| ----------------------------- | ------------------------------- | --------------------------- |
| `getTodayJakarta()`           | Get today's date in Jakarta     | `"2025-11-02"`              |
| `formatDateJakarta(date)`     | Format YYYY-MM-DD to Indonesian | `"02 Nov 2025"`             |
| `formatDateFullJakarta(date)` | Full format with day name       | `"Sabtu, 02 November 2025"` |
| `formatDateTimeJakarta(iso)`  | Format ISO timestamp            | `"02 Nov 2025, 14:30"`      |
| `isValidDateString(date)`     | Validate YYYY-MM-DD format      | `true/false`                |
| `compareDates(d1, d2)`        | Compare two dates               | `-1/0/1`                    |
| `getMonthRange(y, m)`         | Get first/last day of month     | `{start, end}`              |

### 7. Migration Path

**For existing data:**

```sql
-- If dates stored as ISO timestamps, migrate to YYYY-MM-DD
UPDATE cash_book
SET tanggal = DATE(tanggal)
WHERE tanggal LIKE '%T%'; -- Has time component
```

**For future features:**

- Timestamps (created_at, updated_at): Keep as ISO 8601
- Transaction dates: Always YYYY-MM-DD
- Display: Always use utility functions

### 8. Best Practices

✅ **DO:**

- Use `getTodayJakarta()` for default date values
- Use `formatDateJakarta()` for display
- Store dates as `YYYY-MM-DD` strings
- Use `timeZone: "Asia/Jakarta"` in Intl formatters

❌ **DON'T:**

- Use `new Date().toISOString().split("T")[0]` (timezone dependent)
- Use `date.toLocaleDateString()` without timeZone option
- Parse dates with `new Date(dateString)` for display (ambiguous)
- Store dates as timestamps for business dates

### 9. Testing Checklist

- [ ] Input date 2 Nov di Tampa EST → Display "02 Nov 2025"
- [ ] Input date 2 Nov di Jakarta WIB → Display "02 Nov 2025"
- [ ] Delete transaksi di tengah → Recalculation tetap akurat
- [ ] Sort by date → Urutan chronological benar
- [ ] Open form → Default tanggal = hari ini Jakarta
- [ ] Change system timezone → Tanggal tetap konsisten

### 10. Production Deployment Notes

**Server Settings:**

- Node.js timezone: Doesn't matter (we handle it explicitly)
- Database timezone: Doesn't matter (using string dates)
- Server location: Doesn't matter (timezone-agnostic)

**Client Settings:**

- User browser timezone: Doesn't matter (we format explicitly)
- User location: Doesn't matter (always show Jakarta time)

**Monitoring:**

- Log timezone info: Include in error logs for debugging
- Verify date consistency: Spot check data after deployment
