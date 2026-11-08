function csvCell(value) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(filename, rows) {
  const contents = "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([contents], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportReportsAndStats(reports) {
  if (!reports.length) throw new Error("Tidak ada data laporan untuk diekspor.");

  const reportRows = [
    ["id", "created_at", "status", "damage_level", "description", "address", "latitude", "longitude", "photo_url", "after_photo_url", "merged_into"],
    ...reports.map((report) => [
      report.id,
      report.created_at,
      report.status,
      report.damage_level,
      report.description,
      report.address,
      report.latitude,
      report.longitude,
      report.photo_url,
      report.after_photo_url,
      report.merged_into
    ])
  ];

  const statuses = ["Verifikasi", "Belum Ditangani", "Dalam Proses Perbaikan", "Selesai"];
  const statisticsRows = [
    ["jenis", "nilai", "jumlah"],
    ["total_laporan", "", reports.length],
    ...statuses.map((status) => ["status", status, reports.filter((report) => report.status === status).length]),
    ...["Parah", "Sedang", "Ringan"].map((level) => ["damage_level", level, reports.filter((report) => report.damage_level === level).length])
  ];

  downloadCsv("lapor-pak-laporan.csv", reportRows);
  downloadCsv("lapor-pak-statistik.csv", statisticsRows);
}
