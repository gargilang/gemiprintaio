# Business Logic for Cash Book

## Running Balance Calculations

### Kolom yang di-track (Running Total):

1. **Omzet** - Total revenue (cumulative)
2. **Biaya Operasional** - Total operational expenses (cumulative)
3. **Biaya Bahan** - Total material costs (cumulative)
4. **Saldo** - Running cash balance
5. **Laba Bersih** - Net profit = Omzet - Biaya Operasional - Biaya Bahan
6. **Bagi Hasil Anwar** - Anwar's share (running)
7. **Bagi Hasil Suri** - Suri's share (running)
8. **Bagi Hasil Gemi** - Gemi's share (running)
9. **Kasbon Anwar** - Anwar's cash advance (running)
10. **Kasbon Suri** - Suri's cash advance (running)

## Transaction Rules by Category

### 1. OMZET (Revenue)

**Input:** Debit > 0
**Effects:**

- ✅ Omzet += debit
- ✅ Saldo += debit
- ✅ Laba Bersih recalculated
- ✅ Bagi Hasil untuk 3 partner updated (Laba Bersih / 3)

### 2. BIAYA (Operational Expense)

**Input:** Kredit > 0
**Effects:**

- ✅ Biaya Operasional += kredit (cumulative)
- ✅ Saldo -= kredit
- ✅ Laba Bersih -= kredit (recalculated)
- ✅ Bagi Hasil untuk 3 partner updated (Laba Bersih / 3)

### 3. SUPPLY (Material Cost)

**Input:** Kredit > 0
**Effects:**

- ✅ Biaya Bahan += kredit (cumulative)
- ✅ Saldo -= kredit
- ✅ Laba Bersih -= kredit (recalculated)
- ✅ Bagi Hasil untuk 3 partner updated (Laba Bersih / 3)

### 4. INVESTOR (Investment In/Out)

**Input:** Debit (in) or Kredit (out)

**If Debit (Investment IN):**

- ✅ Bagi Hasil Gemi += debit
- ✅ Saldo += debit

**If Kredit (Investment OUT / Withdrawal):**

- ✅ Bagi Hasil Gemi -= kredit
- ✅ Saldo -= kredit

### 5. PRIBADI-A (Anwar Personal)

**Input:** Debit (give) or Kredit (take)

**If Debit (Anwar gives money TO business):**

- ✅ Bagi Hasil Anwar += debit (owed to Anwar)
- ✅ Kasbon Anwar += debit (Anwar's receivable from business)
- ✅ Saldo += debit

**If Kredit (Anwar takes money FROM business):**

- ✅ Bagi Hasil Anwar -= kredit (pay Anwar)
- ✅ Kasbon Anwar -= kredit (reduce Anwar's receivable)
- ✅ Saldo -= kredit

### 6. PRIBADI-S (Suri Personal)

**Input:** Debit (give) or Kredit (take)

**If Debit (Suri gives money TO business):**

- ✅ Bagi Hasil Suri += debit (owed to Suri)
- ✅ Kasbon Suri += kredit (NOTE: opposite direction)
- ✅ Saldo += debit

**If Kredit (Suri takes money FROM business):**

- ✅ Bagi Hasil Suri -= kredit (pay Suri)
- ✅ Kasbon Suri -= debit (NOTE: opposite direction)
- ✅ Saldo -= kredit

**CATATAN PENTING untuk Kasbon Suri:**

> User request: "Kasbon Suri bertambah (kredit) atau berkurang (debit)"
> Ini berarti Kasbon Suri berlawanan dengan logic normal

## Bagi Hasil Distribution

**Formula:**

```
Laba Bersih = Omzet - Biaya Operasional - Biaya Bahan

Bagi Hasil Anwar = Laba Bersih / 3
Bagi Hasil Suri  = Laba Bersih / 3
Bagi Hasil Gemi  = Laba Bersih / 3
```

**Note:**

- Bagi hasil ini adalah running total (bukan per transaksi)
- Updated setiap kali ada perubahan di Omzet, Biaya Operasional, atau Biaya Bahan
- Modified oleh kategori INVESTOR, PRIBADI-A, PRIBADI-S

## Example Scenarios

### Scenario 1: Revenue Transaction

```
Input: Debit 1,000,000 | Kategori: OMZET

Results:
- Omzet: 0 → 1,000,000
- Saldo: 0 → 1,000,000
- Laba Bersih: 0 → 1,000,000
- Bagi Hasil Anwar: 0 → 333,333
- Bagi Hasil Suri: 0 → 333,333
- Bagi Hasil Gemi: 0 → 333,334 (rounding)
```

### Scenario 2: Operational Expense

```
Input: Kredit 200,000 | Kategori: BIAYA

Previous State:
- Omzet: 1,000,000
- Biaya Operasional: 0
- Saldo: 1,000,000

Results:
- Biaya Operasional: 0 → 200,000
- Saldo: 1,000,000 → 800,000
- Laba Bersih: 1,000,000 → 800,000
- Bagi Hasil Anwar: 333,333 → 266,667
- Bagi Hasil Suri: 333,333 → 266,667
- Bagi Hasil Gemi: 333,334 → 266,666
```

### Scenario 3: Anwar Personal (Gives to business)

```
Input: Debit 500,000 | Kategori: PRIBADI-A

Results:
- Bagi Hasil Anwar: 266,667 → 766,667 (owed more)
- Kasbon Anwar: 0 → 500,000 (receivable)
- Saldo: 800,000 → 1,300,000
```

### Scenario 4: Gemi Investment Withdrawal

```
Input: Kredit 300,000 | Kategori: INVESTOR

Results:
- Bagi Hasil Gemi: 266,666 → -33,334 (withdrawn)
- Saldo: 1,300,000 → 1,000,000
```

## Implementation Notes

1. All running totals must be recalculated from beginning when:

   - A transaction is deleted
   - A transaction is edited (future feature)
   - Data is imported

2. The order of transactions matters:

   - Sort by: `tanggal ASC, created_at ASC`
   - Process sequentially to maintain running totals

3. Rounding for Bagi Hasil:
   - Use Math.floor for first two shares
   - Remainder goes to Gemi (last share)
   - Ensures sum equals Laba Bersih exactly
