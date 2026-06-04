"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import SuratJalanTable from "@/components/SuratJalanTable";
import SuratJalanModal, {
  type SuratJalanFormValue,
} from "@/components/SuratJalanModal";
import DialogKonfirmasi from "@/components/DialogKonfirmasi";
import ToastNotifikasi, {
  type NotificationToastProps,
} from "@/components/ToastNotifikasi";
import {
  listSuratJalanAction,
  createSuratJalanAction,
  updateSuratJalanAction,
  updateSuratJalanStatusAction,
  deleteSuratJalanAction,
  getShopSettingsForSJAction,
  buildSJItemsFromSaleAction,
} from "./actions";
import { useCachedData } from "@/lib/use-cached-data";
import type {
  SuratJalan,
  SuratJalanStatus,
} from "@/lib/services/surat-jalan-service";
import { fetchSessionUser } from "@/lib/client-session";
import { PurchaseOrderIcon } from "@/components/icons/PageIcons";

export default function SuratJalanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromSaleId = searchParams?.get("from");

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<SuratJalan | null>(null);
  const [prefilledFromSale, setPrefilledFromSale] =
    useState<Partial<SuratJalanFormValue> | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [notice, setNotice] = useState<NotificationToastProps | null>(null);

  const showMsg = useCallback(
    (type: "success" | "error", message: string) => {
      setNotice({ type, message });
      setTimeout(() => setNotice(null), 3000);
    },
    []
  );

  useEffect(() => {
    void (async () => {
      const u = await fetchSessionUser();
      setCurrentUserId(u?.id ?? null);
    })();
  }, []);

  // Auto-open modal pre-filled when navigating from /pos with ?from=<saleId>
  useEffect(() => {
    if (!fromSaleId) return;
    void (async () => {
      try {
        const prefill = await buildSJItemsFromSaleAction(fromSaleId);
        setPrefilledFromSale({
          penjualan_id: prefill.penjualan_id,
          pelanggan_nama: prefill.pelanggan_nama || "",
          pelanggan_alamat: prefill.pelanggan_alamat || "",
          pelanggan_telepon: prefill.pelanggan_telepon || "",
          items: prefill.items.map((it) => ({
            nama_barang: it.nama_barang,
            keterangan: it.keterangan ?? "",
            ukuran: it.ukuran ?? "",
            qty: it.qty,
            satuan: it.satuan ?? "",
          })),
        });
        setEditTarget(null);
        setShowModal(true);
        // Strip the query param so refresh doesn't re-trigger
        router.replace("/surat-jalan");
      } catch (e: any) {
        showMsg("error", e?.message || "Gagal memuat data penjualan");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromSaleId]);

  const { data, isLoading, mutate } = useCachedData<SuratJalan[]>(
    "surat-jalan-list",
    async () => listSuratJalanAction(200)
  );
  const list = data ?? [];

  const handleSave = async (value: SuratJalanFormValue) => {
    try {
      if (editTarget) {
        await updateSuratJalanAction(editTarget.id, value);
        showMsg("success", `Surat jalan ${editTarget.nomor_sj} diperbarui`);
      } else {
        const res = await createSuratJalanAction({
          ...value,
          dibuat_oleh: currentUserId,
        });
        showMsg("success", `Surat jalan ${res.nomor_sj} dibuat`);
      }
      setShowModal(false);
      setEditTarget(null);
      setPrefilledFromSale(null);
      void mutate();
    } catch (e: any) {
      showMsg("error", e?.message || "Gagal menyimpan surat jalan");
    }
  };

  const handleAdvanceStatus = (sj: SuratJalan, next: SuratJalanStatus) => {
    const labels: Record<SuratJalanStatus, string> = {
      DRAFT: "DRAF",
      TERKIRIM: "TERKIRIM",
      DITERIMA: "DITERIMA",
      BATAL: "BATAL",
    };
    setConfirmDialog({
      title: `Ubah Status ke ${labels[next]}`,
      message:
        next === "TERKIRIM"
          ? `Tandai surat jalan ${sj.nomor_sj} sebagai sudah dikirim?\n\nSetelah ini, surat jalan tidak bisa diedit lagi.`
          : `Tandai surat jalan ${sj.nomor_sj} sebagai sudah diterima oleh penerima?`,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          await updateSuratJalanStatusAction({ id: sj.id, status: next });
          showMsg("success", `Status ${sj.nomor_sj} → ${labels[next]}`);
          void mutate();
        } catch (e: any) {
          showMsg("error", e?.message || "Gagal mengubah status");
        }
      },
    });
  };

  const handleDelete = (sj: SuratJalan) => {
    setConfirmDialog({
      title: "Hapus Surat Jalan",
      message: `Hapus permanen surat jalan ${sj.nomor_sj}?\n\nHanya SJ berstatus DRAF yang bisa dihapus.`,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          await deleteSuratJalanAction(sj.id);
          showMsg("success", `Surat jalan ${sj.nomor_sj} dihapus`);
          void mutate();
        } catch (e: any) {
          showMsg("error", e?.message || "Gagal menghapus surat jalan");
        }
      },
    });
  };

  const handlePreviewOrPrint = async (sj: SuratJalan, mode: "preview" | "print") => {
    try {
      const { generateSuratJalanHTML, printSuratJalan } = await import(
        "@/lib/surat-jalan-print"
      );
      const shop = await getShopSettingsForSJAction();
      const payload = {
        nomor_sj: sj.nomor_sj,
        tanggal: sj.tanggal,
        nomor_faktur: sj.nomor_faktur ?? null,
        pelanggan_nama: sj.pelanggan_nama ?? null,
        pelanggan_alamat: sj.pelanggan_alamat ?? null,
        pelanggan_telepon: sj.pelanggan_telepon ?? null,
        nomor_kendaraan: sj.nomor_kendaraan ?? null,
        pengirim_nama: sj.pengirim_nama ?? null,
        catatan: sj.catatan ?? null,
        diterima_oleh: sj.diterima_oleh ?? null,
        items: (sj.items ?? []).map((it) => ({
          nama_barang: it.nama_barang,
          keterangan: it.keterangan ?? null,
          ukuran: it.ukuran ?? null,
          qty: Number(it.qty) || 0,
          satuan: it.satuan ?? null,
        })),
        shop,
      };
      if (mode === "print") {
        const ok = printSuratJalan(payload);
        if (!ok) showMsg("error", "Tidak bisa membuka jendela cetak. Izinkan pop-up.");
      } else {
        const html = generateSuratJalanHTML(payload);
        window.dispatchEvent(
          new CustomEvent("gemi:preview-faktur", {
            detail: {
              html,
              title: `Surat Jalan ${sj.nomor_sj}`,
              orientation: "portrait",
            },
          })
        );
      }
    } catch (e: any) {
      showMsg("error", e?.message || "Gagal menyiapkan surat jalan");
    }
  };

  return (
    <>
      <div className="space-y-6">
        {/* Title Card */}
        <div className="bg-gradient-to-br from-[#0a1b3d] to-[#00afef] rounded-2xl shadow-lg p-6 mb-2 text-white">
          <div className="flex items-center gap-3">
            <PurchaseOrderIcon size={28} className="text-white" />
            <div>
              <h2 className="text-2xl font-bold uppercase tracking-wide">Surat Jalan</h2>
              <p className="text-white/90 text-sm">Dokumen pengantar barang dari toko ke pelanggan</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
            <button
              onClick={() => {
                setEditTarget(null);
                setShowModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#00afef] to-[#2266ff] text-white rounded-lg font-semibold hover:from-[#0099dd] hover:to-[#1955ee] transition-all shadow-md hover:shadow-lg"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Buat Surat Jalan
            </button>
          </div>

          <SuratJalanTable
            data={list}
            loading={isLoading && list.length === 0}
            onPreview={(sj) => handlePreviewOrPrint(sj, "preview")}
            onPrint={(sj) => handlePreviewOrPrint(sj, "print")}
            onEdit={(sj) => {
              setEditTarget(sj);
              setShowModal(true);
            }}
            onDelete={handleDelete}
            onAdvanceStatus={handleAdvanceStatus}
          />
        </div>
      </div>

      <SuratJalanModal
        show={showModal}
        isEditing={editTarget !== null}
        initialValue={
          editTarget
            ? {
                penjualan_id: editTarget.penjualan_id,
                pelanggan_nama: editTarget.pelanggan_nama,
                pelanggan_alamat: editTarget.pelanggan_alamat,
                pelanggan_telepon: editTarget.pelanggan_telepon,
                tanggal: editTarget.tanggal,
                nomor_kendaraan: editTarget.nomor_kendaraan,
                pengirim_nama: editTarget.pengirim_nama,
                catatan: editTarget.catatan,
                items: (editTarget.items ?? []).map((it) => ({
                  nama_barang: it.nama_barang,
                  keterangan: it.keterangan ?? "",
                  ukuran: it.ukuran ?? "",
                  qty: Number(it.qty) || 0,
                  satuan: it.satuan ?? "",
                })),
              }
            : prefilledFromSale
        }
        onClose={() => {
          setShowModal(false);
          setEditTarget(null);
          setPrefilledFromSale(null);
        }}
        onSave={handleSave}
        onShowMessage={showMsg}
      />

      {confirmDialog && (
        <DialogKonfirmasi
          show={true}
          title={confirmDialog.title}
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
          type="pos"
        />
      )}

      {notice && <ToastNotifikasi type={notice.type} message={notice.message} />}
    </>
  );
}
