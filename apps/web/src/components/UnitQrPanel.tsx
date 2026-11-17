import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download, QrCode, RefreshCw, Power } from "lucide-react";
import { api } from "../api";
import { useLocale } from "../i18n";
import { useConfirmation } from "./ConfirmationProvider";
import { formatDate } from "./ui";

type QrState = { propertyCode: string; unitCode: string; enabled: boolean; issuedAt: string | null; path: string | null };

// Printable card: QR code plus the unit code and a short instruction.
async function renderCard(url: string, unitCode: string, propertyName: string) {
  const qr = document.createElement("canvas");
  await QRCode.toCanvas(qr, url, { width: 480, margin: 2, errorCorrectionLevel: "M" });
  const card = document.createElement("canvas");
  card.width = 560; card.height = 700;
  const context = card.getContext("2d")!;
  context.fillStyle = "#ffffff"; context.fillRect(0, 0, card.width, card.height);
  context.fillStyle = "#12382f"; context.textAlign = "center";
  context.font = "600 30px 'Be Vietnam Pro', sans-serif";
  context.fillText("Quét mã để báo sự cố", card.width / 2, 56);
  context.drawImage(qr, 40, 80);
  context.font = "700 44px 'Be Vietnam Pro', sans-serif";
  context.fillText(`Căn ${unitCode}`, card.width / 2, 610);
  context.font = "400 22px 'Be Vietnam Pro', sans-serif";
  context.fillStyle = "#44564f";
  context.fillText(propertyName.slice(0, 40), card.width / 2, 646);
  context.fillText("Khẩn cấp (cháy, điện giật, ngập): gọi 114", card.width / 2, 680);
  return card.toDataURL("image/png");
}

export function UnitQrPanel({ properties, units }: {
  properties: { code: string; name: string }[]; units: { propertyCode: string; code: string }[]
}) {
  const { text } = useLocale();
  const confirm = useConfirmation();
  const [property, setProperty] = useState("");
  const [unit, setUnit] = useState("");
  const [state, setState] = useState<QrState | null>(null);
  const [image, setImage] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const endpoint = `/rental/units/${encodeURIComponent(property)}/${encodeURIComponent(unit)}/qr`;
  const url = state?.path ? `${window.location.origin}${state.path}` : "";
  const propertyName = properties.find(item => item.code === property)?.name || property;

  useEffect(() => {
    setState(null); setImage(""); setMessage("");
    if (!property || !unit) return;
    let cancelled = false;
    api<QrState>(endpoint).then(result => { if (!cancelled) setState(result); })
      .catch(cause => { if (!cancelled) setMessage(cause instanceof Error ? cause.message : "Error"); });
    return () => { cancelled = true; };
  }, [endpoint, property, unit]);

  useEffect(() => {
    if (!url || !state) { setImage(""); return; }
    renderCard(url, state.unitCode, propertyName).then(setImage).catch(() => setImage(""));
  }, [url, state, propertyName]);

  async function run(method: "POST" | "DELETE") {
    const ok = await confirm(method === "POST"
      ? { title: state?.enabled ? text("Đổi mã QR mới", "Issue a new QR code") : text("Tạo mã QR", "Create QR code"),
        message: state?.enabled ? text("Mã đang dán tại căn sẽ ngừng hoạt động. Cần in và dán mã mới.", "The code posted at the unit stops working. Print and post the new one.")
          : text("Bất kỳ ai quét mã đều gửi được phản ánh cho căn này; nhân viên phải xác minh trước khi giao việc.", "Anyone who scans it can report for this unit; staff must verify before assigning work.") }
      : { title: text("Tắt mã QR", "Disable QR code"), message: text("Mã đã in sẽ ngừng nhận phản ánh. Bật lại sẽ tạo mã mới.", "Printed codes stop accepting reports. Re-enabling issues a new code."), danger: true });
    if (!ok) return;
    setBusy(true); setMessage("");
    try {
      if (method === "POST") setState(await api<QrState>(endpoint, { method: "POST" }));
      else { await api(endpoint, { method: "DELETE" }); setState(await api<QrState>(endpoint)); }
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Error"); }
    finally { setBusy(false); }
  }

  return <section className="panel unit-qr-panel">
    <div className="panel-heading"><div>
      <span className="eyebrow">{text("Tiếp nhận không cần tài khoản", "No-account intake")}</span>
      <h2>{text("Mã QR báo sự cố theo căn", "Unit QR codes for reporting")}</h2>
    </div></div>
    <p>{text("Dán mã trong căn để khách thuê quên hoặc chưa có tài khoản vẫn gửi được phản ánh. Phản ánh qua QR luôn chờ nhân viên gọi lại xác minh.",
      "Post the code in the unit so tenants without an account can still report. QR submissions always wait for staff to call back and verify.")}</p>
    <div className="unit-qr-pickers">
      <label className="field"><span>{text("Cơ sở", "Property")}</span>
        <select value={property} onChange={event => { setProperty(event.target.value); setUnit(""); }}>
          <option value="">{text("Chọn cơ sở", "Select property")}</option>
          {properties.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}
        </select></label>
      <label className="field"><span>{text("Căn hộ", "Unit")}</span>
        <select value={unit} disabled={!property} onChange={event => setUnit(event.target.value)}>
          <option value="">{text("Chọn căn", "Select unit")}</option>
          {units.filter(item => item.propertyCode === property).map(item => <option key={item.code} value={item.code}>{item.code}</option>)}
        </select></label>
    </div>
    {message ? <p role="alert" className="form-error">{message}</p> : null}
    {state ? <div className="unit-qr-body">
      {state.enabled && image ? <img className="unit-qr-image" src={image} alt={text(`Mã QR báo sự cố căn ${state.unitCode}`, `Reporting QR code for unit ${state.unitCode}`)} /> : null}
      <div className="unit-qr-meta">
        <p><strong>{state.enabled ? text("Đang hoạt động", "Active") : text("Chưa bật", "Not enabled")}</strong>
          {state.enabled && state.issuedAt ? ` · ${text("cấp lúc", "issued")} ${formatDate(state.issuedAt)}` : ""}</p>
        {url ? <p className="unit-qr-url"><code>{url}</code></p> : null}
        <div className="unit-qr-actions">
          {state.enabled && image ? <a className="button button-primary" href={image} download={`QR-${state.propertyCode}-${state.unitCode}.png`}><Download size={16} />{text("Tải ảnh để in", "Download to print")}</a> : null}
          {url ? <button type="button" className="button button-secondary" onClick={async () => {
            try { await navigator.clipboard.writeText(url); setMessage(text("Đã sao chép liên kết.", "Link copied.")); } catch { setMessage(text("Không sao chép được, hãy chọn và sao chép thủ công.", "Copy failed; select and copy it manually.")); }
          }}><Copy size={16} />{text("Sao chép liên kết", "Copy link")}</button> : null}
          <button type="button" className="button button-secondary" disabled={busy} onClick={() => run("POST")}>
            {state.enabled ? <RefreshCw size={16} /> : <QrCode size={16} />}{state.enabled ? text("Đổi mã mới", "Issue new code") : text("Tạo mã QR", "Create QR code")}</button>
          {state.enabled ? <button type="button" className="button button-secondary" disabled={busy} onClick={() => run("DELETE")}><Power size={16} />{text("Tắt mã", "Disable")}</button> : null}
        </div>
      </div>
    </div> : null}
  </section>;
}
