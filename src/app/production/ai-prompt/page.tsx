"use client";

import { useMemo, useState } from "react";
import { PlusIcon, TrashIcon } from "@/components/icons/ContentIcons";

type TextRole = "headline" | "subheadline" | "menu" | "cta" | "body" | "small";
type Emphasis = "high" | "medium" | "low";
type ColorMode = "solid" | "gradient";
type ContactType =
  | "whatsapp"
  | "instagram"
  | "facebook"
  | "tiktok"
  | "youtube"
  | "twitter"
  | "website"
  | "email"
  | "address"
  | "phone"
  | "line"
  | "telegram"
  | "gofood"
  | "grabfood"
  | "shopee"
  | "other";
type VisualRole =
  | "subject"
  | "style"
  | "background"
  | "composition"
  | "reference"
  | "note";
type Language = "id" | "en";
type ModelId =
  | "universal"
  | "gpt-image-2"
  | "flux-2-pro"
  | "seedream-4.5"
  | "recraft-v4"
  | "ideogram-v3"
  | "midjourney-v7"
  | "stable-diffusion-3.5";

interface ModelConfig {
  id: ModelId;
  label: string;
  badge: string;
  description: string;
  notes: string; // injected into prompt as model-specific instructions
}

const MODELS: ModelConfig[] = [
  {
    id: "universal",
    label: "Universal",
    badge: "Universal",
    description: "Cocok untuk semua model AI",
    notes: "",
  },
  {
    id: "gpt-image-2",
    label: "GPT Image 2",
    badge: "GPT",
    description: "OpenAI — detail teks & komposisi kuat",
    notes:
      "Target model: GPT Image 2 (OpenAI). Prioritize accurate text rendering, clean composition, and photorealistic or illustrative quality. Describe text placement explicitly.",
  },
  {
    id: "flux-2-pro",
    label: "Flux 2 Pro",
    badge: "Flux",
    description: "Black Forest Labs — fotorealistis & detail tinggi",
    notes:
      "Target model: FLUX 2 Pro (Black Forest Labs). Use highly descriptive, comma-separated style tags. Emphasize lighting, texture, and photorealistic detail. Avoid long paragraphs — prefer concise descriptive phrases.",
  },
  {
    id: "seedream-4.5",
    label: "Seedream 4.5",
    badge: "Seed",
    description: "ByteDance — estetika Asia, teks akurat",
    notes:
      "Target model: Seedream 4.5 (ByteDance). This model excels at Asian aesthetics and accurate multilingual text rendering. Describe cultural context, color harmony, and typographic style explicitly.",
  },
  {
    id: "recraft-v4",
    label: "Recraft V4",
    badge: "Recraft",
    description: "Recraft — vektor, branding & desain grafis",
    notes:
      "Target model: Recraft V4. This model specializes in vector-style, brand design, and graphic design output. Use design-system language: describe layout grid, color palette as hex values, typography hierarchy, and icon style. Avoid photorealistic descriptions.",
  },
  {
    id: "ideogram-v3",
    label: "Ideogram V3",
    badge: "Ideogram",
    description: "Ideogram — teks dalam gambar sangat akurat",
    notes:
      "Target model: Ideogram V3. This model is best-in-class for text-in-image accuracy. Wrap all text strings in double quotes. Specify font style, weight, and placement for each text element. Use magic prompt style.",
  },
  {
    id: "midjourney-v7",
    label: "Midjourney V7",
    badge: "MJ",
    description: "Midjourney — artistik & sinematik",
    notes:
      "Target model: Midjourney V7. Use evocative, artistic language. Add style references (e.g. --style raw), aspect ratio (e.g. --ar 3:1), and quality flags at the end. Avoid instructional language; use descriptive, cinematic prose.",
  },
  {
    id: "stable-diffusion-3.5",
    label: "Stable Diffusion 3.5",
    badge: "SD",
    description: "Stability AI — fleksibel & open source",
    notes:
      "Target model: Stable Diffusion 3.5 (Stability AI). Use structured positive prompt with comma-separated tags. Include quality boosters (masterpiece, best quality, sharp focus). Add a separate NEGATIVE PROMPT section with common artifacts to avoid.",
  },
];

interface TextLine {
  id: string;
  text: string;
  role: TextRole;
  emphasis: Emphasis;
}

interface ColorStop {
  id: string;
  color: string;
  label: string;
}

interface VisualItem {
  id: string;
  text: string;
  role: VisualRole;
}

interface ContactItem {
  id: string;
  type: ContactType;
  value: string;
}

const textRoles: { value: TextRole; label: string }[] = [
  { value: "headline", label: "Headline" },
  { value: "subheadline", label: "Subheadline" },
  { value: "menu", label: "Menu / List" },
  { value: "cta", label: "CTA" },
  { value: "body", label: "Body" },
  { value: "small", label: "Teks kecil" },
];

const emphasisOptions: { value: Emphasis; label: string }[] = [
  { value: "high", label: "Paling menonjol" },
  { value: "medium", label: "Normal" },
  { value: "low", label: "Pendukung" },
];

const visualRoles: { value: VisualRole; label: string }[] = [
  { value: "subject", label: "Subjek utama" },
  { value: "style", label: "Gaya gambar" },
  { value: "background", label: "Background" },
  { value: "composition", label: "Komposisi" },
  { value: "reference", label: "Referensi" },
  { value: "note", label: "Catatan" },
];

const contactLabels: Record<ContactType, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  twitter: "X / Twitter",
  website: "Website",
  email: "Email",
  address: "Alamat",
  phone: "Telepon",
  line: "LINE",
  telegram: "Telegram",
  gofood: "GoFood",
  grabfood: "GrabFood",
  shopee: "ShopeeFood",
  other: "Lainnya",
};

const contactPlaceholders: Record<ContactType, string> = {
  whatsapp: "Contoh: 0812-3456-7890",
  instagram: "Contoh: @mbokgalak",
  facebook: "Contoh: fb.com/mbokgalak",
  tiktok: "Contoh: @mbokgalak",
  youtube: "Contoh: youtube.com/@mbokgalak",
  twitter: "Contoh: @mbokgalak",
  website: "Contoh: mbokgalak.id",
  email: "Contoh: halo@mbokgalak.id",
  address: "Contoh: Jl. Merdeka No. 10",
  phone: "Contoh: 021-1234567",
  line: "Contoh: @mbokgalak",
  telegram: "Contoh: @mbokgalak",
  gofood: "Contoh: gofood.co.id/mbokgalak",
  grabfood: "Contoh: grab.com/mbokgalak",
  shopee: "Contoh: shopee.co.id/mbokgalak",
  other: "Contoh: info lainnya",
};

const makeContactItem = (type: ContactType = "whatsapp"): ContactItem => ({
  id: makeId(),
  type,
  value: "",
});

const makeId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const makeTextLine = (
  text = "",
  role: TextRole = "headline",
  emphasis: Emphasis = "high"
): TextLine => ({
  id: makeId(),
  text,
  role,
  emphasis,
});

const makeColorStop = (color = "#00afef", label = ""): ColorStop => ({
  id: makeId(),
  color,
  label,
});

const makeVisualItem = (
  text = "",
  role: VisualRole = "subject"
): VisualItem => ({
  id: makeId(),
  text,
  role,
});

const initialContacts = (): ContactItem[] => [
  makeContactItem("whatsapp"),
];

function buildPrompt(input: {
  rawBrief: string;
  designType: string;
  businessName: string;
  audience: string;
  styleDirection: string;
  mood: string;
  textLines: TextLine[];
  colorMode: ColorMode;
  colors: ColorStop[];
  visualItems: VisualItem[];
  contacts: ContactItem[];
  width: string;
  height: string;
  unit: string;
  orientation: string;
  dpi: string;
  bleed: string;
  safeMargin: string;
  outputFormat: string;
  negativePrompt: string;
  language: Language;
  modelNotes: string;
}) {
  const isID = input.language === "id";
  const cleanTextLines = input.textLines.filter((line) => line.text.trim());
  const cleanColors = input.colors.filter((color) => color.color.trim());
  const cleanVisualItems = input.visualItems.filter((item) => item.text.trim());
  const contacts = input.contacts
    .filter((item) => item.value.trim())
    .map((item) => `${contactLabels[item.type]}: ${item.value.trim()}`);

  const size = [input.width, input.height].filter(Boolean).join(" x ");
  const specs = [
    size ? `Size: ${size} ${input.unit}` : "",
    input.orientation ? `Orientation: ${input.orientation}` : "",
    input.dpi ? `Resolution: ${input.dpi} DPI` : "",
    input.bleed ? `Bleed: ${input.bleed}` : "",
    input.safeMargin ? `Safe margin: ${input.safeMargin}` : "",
    input.outputFormat ? `Preferred output: ${input.outputFormat}` : "",
  ].filter(Boolean);

  const L = {
    intro: isID
      ? "Buat prompt detail siap cetak untuk AI generatif desain."
      : "Create a detailed, print-ready prompt for a generative design AI.",
    briefSection: "DESIGN BRIEF",
    designType: isID ? "Jenis desain" : "Design type",
    businessName: isID ? "Nama usaha / brand" : "Business or brand name",
    audience: isID ? "Target audiens" : "Target audience",
    visualStyle: isID ? "Gaya visual" : "Visual style",
    mood: "Mood",
    brief: isID ? "Brief pelanggan, pertahankan maksudnya" : "Original customer brief, keep the intent",
    textSection: isID ? "TEKS YANG HARUS DIMUAT" : "TEXT TO INCLUDE",
    noText: isID
      ? "Belum ada teks yang ditentukan. Sisakan area kosong untuk penempatan teks."
      : "No exact text has been provided yet. Leave clean empty areas for copy placement.",
    contactSection: isID ? "Kontak yang ditampilkan" : "Contact details to show",
    colorSection: isID ? "ARAH WARNA" : "COLOR DIRECTION",
    colorDesc: (mode: string, colors: string) =>
      isID
        ? `Gunakan arah warna ${mode === "solid" ? "solid" : "gradien"} dengan warna berikut: ${colors}.`
        : `Use a ${mode} color direction with these colors: ${colors}.`,
    noColor: isID
      ? "Pilih palet warna komersial yang seimbang sesuai bisnis."
      : "Choose a balanced commercial color palette that fits the business.",
    visualSection: isID ? "ARAH VISUAL" : "VISUAL DIRECTION",
    noVisual: isID
      ? "Belum ada arah visual. Simpulkan komposisi komersial yang bersih dari brief."
      : "No specific visual direction has been provided yet. Infer a clean commercial composition from the brief.",
    printNote: isID
      ? "- Buat desain yang jelas dari jarak jauh, komersial, mudah dibaca, dan cocok untuk produksi cetak Indonesia."
      : "- Make the design clear from a distance, commercial, readable, and suitable for Indonesian print production.",
    specsSection: isID ? "SPESIFIKASI CETAK" : "PRINT SPECS",
    noSpecs: isID
      ? "- Layout siap cetak dengan teks tajam dan safe margin yang cukup."
      : "- Print-ready layout with sharp text and enough safe margin.",
    negSection: isID ? "NEGATIVE PROMPT" : "NEGATIVE PROMPT",
    defaultNeg: isID
      ? "Hindari teks salah eja, kata acak, wajah terdistorsi, tipografi tidak terbaca, layout berantakan, resolusi rendah, kontak salah, dan elemen penting terpotong."
      : "Avoid misspelled text, extra random words, distorted faces, unreadable typography, cluttered layout, low resolution, wrong contact details, and cropped important elements.",
  };

  return [
    input.modelNotes ? `[MODEL INSTRUCTIONS]\n${input.modelNotes}\n` : "",
    L.intro,
    ``,
    L.briefSection,
    `- ${L.designType}: ${input.designType || (isID ? "spanduk / banner cetak" : "printed banner / sign design")}`,
    input.businessName ? `- ${L.businessName}: ${input.businessName}` : "",
    input.audience ? `- ${L.audience}: ${input.audience}` : "",
    input.styleDirection ? `- ${L.visualStyle}: ${input.styleDirection}` : "",
    input.mood ? `- ${L.mood}: ${input.mood}` : "",
    input.rawBrief ? `- ${L.brief}: ${input.rawBrief}` : "",
    ``,
    L.textSection,
    cleanTextLines.length
      ? cleanTextLines
          .map(
            (line, index) =>
              `${index + 1}. "${line.text.trim()}" - role: ${line.role}, emphasis: ${line.emphasis}`
          )
          .join("\n")
      : L.noText,
    contacts.length ? `\n${L.contactSection}:\n${contacts.map((item) => `- ${item}`).join("\n")}` : "",
    ``,
    L.colorSection,
    cleanColors.length
      ? L.colorDesc(
          input.colorMode,
          cleanColors.map((item) => `${item.color}${item.label ? ` (${item.label})` : ""}`).join(", ")
        )
      : L.noColor,
    ``,
    L.visualSection,
    cleanVisualItems.length
      ? cleanVisualItems
          .map((item, index) => `${index + 1}. ${item.role}: ${item.text.trim()}`)
          .join("\n")
      : L.noVisual,
    L.printNote,
    ``,
    L.specsSection,
    specs.length ? specs.map((item) => `- ${item}`).join("\n") : L.noSpecs,
    ``,
    L.negSection,
    input.negativePrompt || L.defaultNeg,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export default function AiPromptPage() {
  const [rawBrief, setRawBrief] = useState("");
  const [designType, setDesignType] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [audience, setAudience] = useState("");
  const [styleDirection, setStyleDirection] = useState("");
  const [mood, setMood] = useState("");
  const [textLines, setTextLines] = useState<TextLine[]>(() => [
    makeTextLine(),
  ]);
  const [colorMode, setColorMode] = useState<ColorMode>("solid");
  const [colors, setColors] = useState<ColorStop[]>(() => [
    makeColorStop(),
  ]);
  const [visualItems, setVisualItems] = useState<VisualItem[]>(() => [
    makeVisualItem(),
  ]);
  const [contacts, setContacts] = useState<ContactItem[]>(initialContacts);
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [unit, setUnit] = useState("cm");
  const [orientation, setOrientation] = useState("landscape");
  const [dpi, setDpi] = useState("");
  const [bleed, setBleed] = useState("");
  const [safeMargin, setSafeMargin] = useState("");
  const [outputFormat, setOutputFormat] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [language, setLanguage] = useState<Language>("id");
  const [modelId, setModelId] = useState<ModelId>("universal");

  const generatedPrompt = useMemo(
    () =>
      buildPrompt({
        rawBrief,
        designType,
        businessName,
        audience,
        styleDirection,
        mood,
        textLines,
        colorMode,
        colors,
        visualItems,
        contacts,
        width,
        height,
        unit,
        orientation,
        dpi,
        bleed,
        safeMargin,
        outputFormat,
        negativePrompt,
        language,
        modelNotes: MODELS.find((m) => m.id === modelId)?.notes ?? "",
      }),
    [
      rawBrief,
      designType,
      businessName,
      audience,
      styleDirection,
      mood,
      textLines,
      colorMode,
      colors,
      visualItems,
      contacts,
      width,
      height,
      unit,
      orientation,
      dpi,
      bleed,
      safeMargin,
      outputFormat,
      negativePrompt,
      language,
      modelId,
    ]
  );

  const resetForm = () => {
    setRawBrief("");
    setDesignType("");
    setBusinessName("");
    setAudience("");
    setStyleDirection("");
    setMood("");
    setTextLines([makeTextLine()]);
    setColorMode("solid");
    setColors([makeColorStop()]);
    setVisualItems([makeVisualItem()]);
    setContacts(initialContacts());
    setWidth("");
    setHeight("");
    setUnit("cm");
    setOrientation("landscape");
    setDpi("");
    setBleed("");
    setSafeMargin("");
    setOutputFormat("");
    setNegativePrompt("");
    setCopyState("idle");
    setLanguage("id");
    setModelId("universal");
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(generatedPrompt);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("failed");
      window.setTimeout(() => setCopyState("idle"), 2200);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-cyan-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-[#00afef]">
              Design Prompt Maker
            </p>
            <h2 className="mt-1 text-2xl font-bold text-[#0a1b3d] dark:text-slate-100">
              Ubah imajinasi pelanggan menjadi prompt gambar siap pakai untuk Generative AI
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={copyPrompt}
              className="rounded-lg bg-gradient-to-r from-[#00afef] to-[#dc2626] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md"
            >
              {copyState === "copied"
                ? "Copied"
                : copyState === "failed"
                  ? "Gagal copy"
                  : "Copy Prompt"}
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(380px,0.95fr)]">
        <div className="space-y-6">
          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-lg font-bold text-[#0a1b3d] dark:text-slate-100">
              Arah Desain & Spesifikasi Cetak
            </h3>
            <div className="mt-4 grid gap-4">
              <label className="block">
                <span className="text-sm font-semibold text-gray-700 dark:text-slate-300">
                  Brief mentah pelanggan
                </span>
                <textarea
                  value={rawBrief}
                  onChange={(event) => setRawBrief(event.target.value)}
                  rows={4}
                  placeholder="Contoh: bang buatin spanduk dagang Mbok Galak, ada gambar ibu-ibu marah, tema oranye, menu ayam geprek dan seblak"
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#00afef] focus:ring-2 focus:ring-[#00afef]/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <TextInput
                  label="Jenis desain"
                  value={designType}
                  onChange={setDesignType}
                  placeholder="Contoh: spanduk dagang, banner promo, poster menu"
                />
                <TextInput
                  label="Nama usaha / brand"
                  value={businessName}
                  onChange={setBusinessName}
                  placeholder="Contoh: Mbok Galak"
                />
                <TextInput
                  label="Target audiens"
                  value={audience}
                  onChange={setAudience}
                  placeholder="Contoh: keluarga, pekerja kantor, anak sekolah"
                />
                <TextInput
                  label="Mood"
                  value={mood}
                  onChange={setMood}
                  placeholder="Contoh: pedas, berani, lucu, premium"
                />
              </div>
              <TextInput
                label="Gaya visual"
                value={styleDirection}
                onChange={setStyleDirection}
                placeholder="Contoh: ramai, tajam, modern, mudah dibaca dari jauh"
              />
              <div className="border-t border-gray-100 pt-4 dark:border-slate-800">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">Spesifikasi Cetak</p>
                <div className="grid gap-4 md:grid-cols-4">
                  <TextInput label="Lebar" value={width} onChange={setWidth} placeholder="Contoh: 300" />
                  <TextInput label="Tinggi" value={height} onChange={setHeight} placeholder="Contoh: 100" />
                  <SelectInput label="Satuan" value={unit} onChange={setUnit} options={["cm", "m", "px"]} />
                  <SelectInput label="Orientasi" value={orientation} onChange={setOrientation} options={["landscape", "portrait", "square"]} />
                  <TextInput label="DPI" value={dpi} onChange={setDpi} placeholder="Contoh: 150" />
                  <TextInput label="Bleed" value={bleed} onChange={setBleed} placeholder="Contoh: 3 mm" />
                  <TextInput label="Safe margin" value={safeMargin} onChange={setSafeMargin} placeholder="Contoh: 5 cm dari tepi" />
                  <TextInput label="Output" value={outputFormat} onChange={setOutputFormat} placeholder="Contoh: PNG high-res atau file editable" />
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-[#0a1b3d] dark:text-slate-100">
                Teks desain
              </h3>
              <button
                type="button"
                onClick={() => setTextLines((items) => [...items, makeTextLine()])}
                title="Tambah baris"
                aria-label="Tambah baris teks"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#00afef] text-[#007db0] transition-colors hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-950/30"
              >
                <PlusIcon size={20} />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {textLines.map((line, index) => (
                <div
                  key={line.id}
                  className="rounded-lg border border-gray-200 p-3 dark:border-slate-800"
                >
                  <input
                    value={line.text}
                    onChange={(event) =>
                      setTextLines((items) =>
                        items.map((item) =>
                          item.id === line.id ? { ...item, text: event.target.value } : item
                        )
                      )
                    }
                    placeholder={`Baris ${index + 1}, contoh: MBOK GALAK`}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#00afef] focus:ring-2 focus:ring-[#00afef]/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                  <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(140px,1fr)_minmax(160px,1fr)_40px]">
                    <select
                      value={line.role}
                      onChange={(event) =>
                        setTextLines((items) =>
                          items.map((item) =>
                            item.id === line.id
                              ? { ...item, role: event.target.value as TextRole }
                              : item
                          )
                        )
                      }
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    >
                      {textRoles.map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={line.emphasis}
                      onChange={(event) =>
                        setTextLines((items) =>
                          items.map((item) =>
                            item.id === line.id
                              ? {
                                  ...item,
                                  emphasis: event.target.value as Emphasis,
                                }
                              : item
                          )
                        )
                      }
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    >
                      {emphasisOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        setTextLines((items) =>
                          items.length === 1
                            ? [makeTextLine()]
                            : items.filter((item) => item.id !== line.id)
                        )
                      }
                      title="Hapus baris"
                      aria-label="Hapus baris teks"
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 text-red-600 transition-colors hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30"
                    >
                      <TrashIcon size={20} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-[#0a1b3d] dark:text-slate-100">
                Warna & visual
              </h3>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border border-gray-300 p-1 dark:border-slate-700">
                  {(["solid", "gradient"] as ColorMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setColorMode(mode);
                        if (mode === "gradient" && colors.length < 2) {
                          setColors((current) => [...current, makeColorStop("#dc2626")]);
                        }
                      }}
                      className={`rounded-md px-3 py-1.5 text-sm font-semibold capitalize transition-colors ${
                        colorMode === mode
                          ? "bg-[#00afef] text-white"
                          : "text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setColors((current) => [...current, makeColorStop("#00afef")])}
                  title="Tambah warna"
                  aria-label="Tambah warna"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#00afef] text-[#007db0] transition-colors hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-950/30"
                >
                  <PlusIcon size={20} />
                </button>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {colors.map((item) => (
                <div
                  key={item.id}
                  className="grid gap-3 rounded-lg border border-gray-200 p-3 dark:border-slate-800 sm:grid-cols-[64px_minmax(0,1fr)_auto]"
                >
                  <input
                    type="color"
                    value={item.color}
                    onChange={(event) =>
                      setColors((current) =>
                        current.map((color) =>
                          color.id === item.id ? { ...color, color: event.target.value } : color
                        )
                      )
                    }
                    className="h-10 w-full rounded-lg border border-gray-300 bg-white p-1 dark:border-slate-700 dark:bg-slate-950"
                  />
                  <input
                    value={item.label}
                    onChange={(event) =>
                      setColors((current) =>
                        current.map((color) =>
                          color.id === item.id ? { ...color, label: event.target.value } : color
                        )
                      )
                    }
                    placeholder="Nama warna, contoh: oranye utama"
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#00afef] focus:ring-2 focus:ring-[#00afef]/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setColors((current) =>
                        current.length === 1 ? [makeColorStop()] : current.filter((color) => color.id !== item.id)
                      )
                    }
                    title="Hapus warna"
                    aria-label="Hapus warna"
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30"
                  >
                    <TrashIcon size={20} />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-6">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-slate-300">
                  Visual
                </h4>
                <button
                  type="button"
                  onClick={() =>
                    setVisualItems((items) => [...items, makeVisualItem()])
                  }
                  title="Tambah visual"
                  aria-label="Tambah visual"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#00afef] text-[#007db0] transition-colors hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-950/30"
                >
                  <PlusIcon size={20} />
                </button>
              </div>
              <div className="mt-3 space-y-3">
                {visualItems.map((item) => (
                  <div
                    key={item.id}
                    className="grid gap-3 rounded-lg border border-gray-200 p-3 dark:border-slate-800 md:grid-cols-[180px_minmax(0,1fr)_40px]"
                  >
                    <select
                      value={item.role}
                      onChange={(event) =>
                        setVisualItems((items) =>
                          items.map((visual) =>
                            visual.id === item.id
                              ? {
                                  ...visual,
                                  role: event.target.value as VisualRole,
                                }
                              : visual
                          )
                        )
                      }
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    >
                      {visualRoles.map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                    <input
                      value={item.text}
                      onChange={(event) =>
                        setVisualItems((items) =>
                          items.map((visual) =>
                            visual.id === item.id
                              ? { ...visual, text: event.target.value }
                              : visual
                          )
                        )
                      }
                      placeholder="Contoh: ibu warung ekspresi galak lucu memegang spatula"
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#00afef] focus:ring-2 focus:ring-[#00afef]/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setVisualItems((items) =>
                          items.length === 1
                            ? [makeVisualItem()]
                            : items.filter((visual) => visual.id !== item.id)
                        )
                      }
                      title="Hapus visual"
                      aria-label="Hapus visual"
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30"
                    >
                      <TrashIcon size={20} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-[#0a1b3d] dark:text-slate-100">
                Kontak
              </h3>
              <button
                type="button"
                onClick={() => setContacts((current) => [...current, makeContactItem("instagram")])}
                title="Tambah kontak"
                aria-label="Tambah kontak"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#00afef] text-[#007db0] transition-colors hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-950/30"
              >
                <PlusIcon size={20} />
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {contacts.map((item) => (
                <div
                  key={item.id}
                  className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)_40px]"
                >
                  <select
                    value={item.type}
                    onChange={(e) =>
                      setContacts((current) =>
                        current.map((c) =>
                          c.id === item.id ? { ...c, type: e.target.value as ContactType } : c
                        )
                      )
                    }
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {(Object.keys(contactLabels) as ContactType[]).map((key) => (
                      <option key={key} value={key}>
                        {contactLabels[key]}
                      </option>
                    ))}
                  </select>
                  <input
                    value={item.value}
                    onChange={(e) =>
                      setContacts((current) =>
                        current.map((c) =>
                          c.id === item.id ? { ...c, value: e.target.value } : c
                        )
                      )
                    }
                    placeholder={contactPlaceholders[item.type]}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#00afef] focus:ring-2 focus:ring-[#00afef]/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setContacts((current) =>
                        current.length === 1 ? initialContacts() : current.filter((c) => c.id !== item.id)
                      )
                    }
                    title="Hapus kontak"
                    aria-label="Hapus kontak"
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 text-red-600 transition-colors hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30"
                  >
                    <TrashIcon size={20} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-lg font-bold text-[#0a1b3d] dark:text-slate-100">
              Negative Prompt
            </h3>
            <label className="mt-4 block">
              <span className="text-sm font-semibold text-gray-700 dark:text-slate-300">
                Hal yang ingin dihindari
              </span>
              <textarea
                value={negativePrompt}
                onChange={(event) => setNegativePrompt(event.target.value)}
                rows={3}
                placeholder="Contoh: jangan pakai foto realistis, jangan terlalu ramai, tanpa watermark"
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#00afef] focus:ring-2 focus:ring-[#00afef]/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
          </section>
        </div>

        <aside className="xl:sticky xl:top-28 xl:self-start">
          <section className="rounded-lg border border-[#00afef]/25 bg-white p-5 shadow-sm dark:border-cyan-900/60 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-[#0a1b3d] dark:text-slate-100">
                Hasil Prompt
              </h3>
              <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold text-[#007db0] dark:bg-cyan-950/40 dark:text-cyan-300">
                {MODELS.find((m) => m.id === modelId)?.badge ?? "Universal"}
              </span>
            </div>
            {/* Language toggle */}
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500 dark:text-slate-400">Bahasa:</span>
              <div className="flex rounded-lg border border-gray-300 p-0.5 dark:border-slate-700">
                {(["id", "en"] as Language[]).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setLanguage(lang)}
                    className={`rounded-md px-3 py-1 text-xs font-bold uppercase transition-colors ${
                      language === lang
                        ? "bg-[#00afef] text-white"
                        : "text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    {lang === "id" ? "Indonesia" : "English"}
                  </button>
                ))}
              </div>
            </div>
            {/* Model selector */}
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 shrink-0">Model AI:</span>
              <select
                value={modelId}
                onChange={(e) => setModelId(e.target.value as ModelId)}
                className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 outline-none transition focus:border-[#00afef] focus:ring-2 focus:ring-[#00afef]/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label} — {model.description}
                  </option>
                ))}
              </select>
            </div>
            <pre className="mt-4 max-h-[calc(100vh-220px)] min-h-[520px] overflow-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed text-gray-900 shadow-inner dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
              {generatedPrompt}
            </pre>
          </section>
        </aside>
      </div>
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-gray-700 dark:text-slate-300">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#00afef] focus:ring-2 focus:ring-[#00afef]/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
      />
    </label>
  );
}

function SelectInput({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-gray-700 dark:text-slate-300">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#00afef] focus:ring-2 focus:ring-[#00afef]/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
