import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, Home, Inbox, Search, Users } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import { useApiData } from "../hooks/useApiData";
import { useLocale } from "../i18n";
import { ErrorState, LoadingState, PageHeader, formatDate } from "../components/ui";
import { Modal } from "../components/Modal";
import { useConfirmation } from "../components/ConfirmationProvider";

type Occupancy = "vacant" | "reserved" | "occupied" | "notice";
type Readiness = "needs_cleaning" | "cleaned" | "under_repair" | "ready";
type UnitRow = {
  propertyCode: string; code: string; floor: string; residentCount: number; occupancyStatus: Occupancy; readinessStatus: Readiness;
  availableFrom: string | null; statusNote: string; statusUpdatedAt: string | null; statusUpdatedByName: string; openCases: number; rentable: boolean
};
type Board = {
  properties: { code: string; name: string; address: string }[]; units: UnitRow[];
  summary: { total: number; rentable: number; occupancy: Record<Occupancy, number>; readiness: Record<Readiness, number> }
};
type Detail = { history: { axis: string; from: string; to: string; note: string; actorName: string; at: string }[];
  residents: { _id: string; name: string; email: string; active: boolean }[] };

export const occupancyLabels: Record<Occupancy, { vi: string; en: string }> = {
  vacant: { vi: "Trống", en: "Vacant" }, reserved: { vi: "Đã đặt cọc", en: "Reserved" },
  occupied: { vi: "Đang cho thuê", en: "Occupied" }, notice: { vi: "Sắp trả căn", en: "Moving out" }
};
export const readinessLabels: Record<Readiness, { vi: string; en: string }> = {
  needs_cleaning: { vi: "Chờ dọn", en: "Needs cleaning" }, cleaned: { vi: "Đã dọn", en: "Cleaned" },
  under_repair: { vi: "Đang tu sửa", en: "Under repair" }, ready: { vi: "Sẵn sàng", en: "Ready" }
};

export function UnitsPage() {
  const { user } = useAuth();
  const { text, locale } = useLocale();
  const canLease = ["manager", "org_admin", "platform_admin"].includes(user?.role || "");
  const { data, error, loading, reload } = useApiData<Board>("/rental/units");
  const [property, setProperty] = useState("");
  const [occupancy, setOccupancy] = useState<"" | Occupancy | "rentable">("");
  const [readiness, setReadiness] = useState<"" | Readiness>("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<UnitRow | null>(null);
  useEffect(() => { if (!property && data?.properties.length) setProperty(data.properties[0].code); }, [data, property]);

  const inProperty = useMemo(() => (data?.units || []).filter(unit => !property || unit.propertyCode === property), [data, property]);
  // Two independent filter groups (letting and readiness) that combine with AND.
  const matchesOccupancy = (unit: UnitRow, value = occupancy) => value === "rentable" ? unit.rentable : !value || unit.occupancyStatus === value;
  const matchesReadiness = (unit: UnitRow, value = readiness) => !value || unit.readinessStatus === value;
  const matchesQuery = (unit: UnitRow) => !query || unit.code.toLowerCase().includes(query.trim().toLowerCase());
  const visible = inProperty.filter(unit => matchesOccupancy(unit) && matchesReadiness(unit) && matchesQuery(unit));
  const floors = [...new Set(visible.map(unit => unit.floor))].sort((a, b) => Number(b) - Number(a) || b.localeCompare(a));
  type Chip = { key: string; label: string; value: number; active: boolean; onClick: () => void; tone: string };
  // Each group's counts respect the other group's current choice, so the numbers match what clicking shows.
  const occupancyChips: Chip[] = [
    { key: "occ-all", label: text("Tất cả", "All"), value: inProperty.filter(unit => matchesReadiness(unit)).length, active: !occupancy, tone: "neutral", onClick: () => setOccupancy("") },
    { key: "rentable", label: text("Cho thuê được", "Ready to let"), value: inProperty.filter(unit => unit.rentable && matchesReadiness(unit)).length, active: occupancy === "rentable", tone: "success",
      onClick: () => setOccupancy(occupancy === "rentable" ? "" : "rentable") },
    ...(Object.keys(occupancyLabels) as Occupancy[]).map(key => ({ key, label: occupancyLabels[key][locale],
      value: inProperty.filter(unit => unit.occupancyStatus === key && matchesReadiness(unit)).length,
      active: occupancy === key, tone: `occ-${key}`, onClick: () => setOccupancy(occupancy === key ? "" : key) }))
  ];
  const readinessChips: Chip[] = [
    { key: "ready-all", label: text("Tất cả", "All"), value: inProperty.filter(unit => matchesOccupancy(unit)).length, active: !readiness, tone: "neutral", onClick: () => setReadiness("") },
    ...(Object.keys(readinessLabels) as Readiness[]).map(key => ({ key, label: readinessLabels[key][locale],
      value: inProperty.filter(unit => unit.readinessStatus === key && matchesOccupancy(unit)).length,
      active: readiness === key, tone: `ready-${key}`, onClick: () => setReadiness(readiness === key ? "" : key) }))
  ];
  const renderChips = (chips: Chip[]) => chips.map(chip => <button key={chip.key} type="button" className={`unit-chip unit-chip-${chip.tone}`} aria-pressed={chip.active} onClick={chip.onClick}>
    <span>{chip.label}</span><strong>{chip.value}</strong></button>);

  return <div className="page-stack units-page">
    <PageHeader title={text("Căn hộ", "Units")} />
    {loading && !data ? <LoadingState /> : null}
    {error ? <ErrorState message={error} onRetry={reload} /> : null}
    {data ? <>
      <div className="units-toolbar">
        <label className="field"><span>{text("Tòa nhà", "Property")}</span>
          <select value={property} onChange={event => setProperty(event.target.value)}>
            {data.properties.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}
          </select></label>
        <label className="field units-search"><span>{text("Tìm căn", "Find unit")}</span>
          <span className="units-search-input"><Search size={16} aria-hidden="true" /><input value={query} maxLength={32} onChange={event => setQuery(event.target.value)} placeholder={text("Mã căn", "Unit code")} /></span></label>
      </div>
      <div className="unit-filter-groups">
        <div className="unit-filter-group">
          <span className="unit-filter-label" id="unit-filter-occupancy">{text("Tình trạng thuê", "Letting")}</span>
          <div className="unit-chips" role="group" aria-labelledby="unit-filter-occupancy">{renderChips(occupancyChips)}</div>
        </div>
        <div className="unit-filter-group">
          <span className="unit-filter-label" id="unit-filter-readiness">{text("Dọn dẹp / sửa chữa", "Cleaning / repair")}</span>
          <div className="unit-chips" role="group" aria-labelledby="unit-filter-readiness">{renderChips(readinessChips)}</div>
        </div>
      </div>
      {!visible.length ? <p className="empty-note">{text("Không có căn nào khớp bộ lọc.", "No units match the filters.")}</p> : null}
      {floors.map(floor => <section key={floor} className="unit-floor" aria-label={text(`Tầng ${Number(floor)}`, `Floor ${Number(floor)}`)}>
        <h2>{text("Tầng", "Floor")} {Number(floor) || floor}</h2>
        <div className="unit-grid">
          {visible.filter(unit => unit.floor === floor).map(unit => <button key={unit.propertyCode + unit.code} type="button"
            className={`unit-tile unit-occ-${unit.occupancyStatus} unit-ready-${unit.readinessStatus}`} onClick={() => setSelected(unit)}>
            <span className="unit-tile-head"><strong>{unit.code}</strong>{unit.rentable ? <span className="unit-rentable">{text("Cho thuê được", "Ready to let")}</span> : null}</span>
            <span className="unit-tag unit-tag-occ">{occupancyLabels[unit.occupancyStatus][locale]}</span>
            <span className="unit-tag unit-tag-ready">{readinessLabels[unit.readinessStatus][locale]}</span>
            <span className="unit-tile-meta">
              {unit.residentCount ? <span><Users size={14} aria-hidden="true" />{unit.residentCount}</span> : null}
              {unit.openCases ? <span className="unit-open-cases"><Inbox size={14} aria-hidden="true" />{unit.openCases}</span> : null}
              {unit.availableFrom ? <span><CalendarClock size={14} aria-hidden="true" />{new Date(unit.availableFrom).toLocaleDateString(locale === "vi" ? "vi-VN" : "en-GB")}</span> : null}
            </span>
          </button>)}
        </div>
      </section>)}
    </> : null}
    {selected ? <UnitDialog unit={selected} canLease={canLease} onClose={() => setSelected(null)} onSaved={async () => { setSelected(null); await reload(); }} /> : null}
  </div>;
}

function UnitDialog({ unit, canLease, onClose, onSaved }: { unit: UnitRow; canLease: boolean; onClose: () => void; onSaved: () => void }) {
  const { text, locale } = useLocale();
  const confirm = useConfirmation();
  const base = `/rental/units/${encodeURIComponent(unit.propertyCode)}/${encodeURIComponent(unit.code)}/status`;
  const { data } = useApiData<Detail>(base);
  const [occupancy, setOccupancy] = useState<Occupancy>(unit.occupancyStatus);
  const [readiness, setReadiness] = useState<Readiness>(unit.readinessStatus);
  const [availableFrom, setAvailableFrom] = useState(unit.availableFrom ? unit.availableFrom.slice(0, 10) : "");
  const [release, setRelease] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const releasing = canLease && occupancy === "vacant" && unit.residentCount > 0;
  const label = (axis: string, value: string) => (axis === "occupancy" ? occupancyLabels[value as Occupancy] : readinessLabels[value as Readiness])?.[locale] || value;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (releasing && !release) { setFailure(text("Căn còn người thuê. Đánh dấu gỡ người thuê để trả căn.", "The unit still has tenants. Tick release tenants to check out.")); return; }
    if (release && !await confirm({ title: text("Trả căn", "Check out unit"), danger: true,
      message: text("Người thuê sẽ bị gỡ khỏi căn và không gửi phản ánh cho căn này được nữa. Căn chuyển sang chờ dọn.", "Tenants are removed from the unit and can no longer report for it. The unit moves to needs cleaning.") })) return;
    setBusy(true); setFailure("");
    try {
      const nextAvailable = availableFrom || null;
      await api(base, { method: "PATCH", body: JSON.stringify({
        ...(canLease && occupancy !== unit.occupancyStatus ? { occupancyStatus: occupancy } : {}),
        ...(readiness !== unit.readinessStatus ? { readinessStatus: readiness } : {}),
        ...(canLease && nextAvailable !== (unit.availableFrom ? unit.availableFrom.slice(0, 10) : null) ? { availableFrom: nextAvailable } : {}),
        ...(release ? { releaseResidents: true } : {}), note: note.trim()
      }) });
      onSaved();
    } catch (cause) { setFailure(cause instanceof Error ? cause.message : text("Không lưu được.", "Unable to save.")); }
    finally { setBusy(false); }
  }

  return <Modal title={text(`Căn ${unit.code}`, `Unit ${unit.code}`)} onClose={onClose}>
    <div className="unit-dialog">
      <p className="unit-dialog-status">
        <span className="unit-tag unit-tag-occ">{occupancyLabels[unit.occupancyStatus][locale]}</span>
        <span className="unit-tag unit-tag-ready">{readinessLabels[unit.readinessStatus][locale]}</span>
        {unit.statusNote ? <span>{unit.statusNote}</span> : null}
      </p>
      {unit.statusUpdatedAt ? <p className="unit-dialog-meta">{text("Cập nhật", "Updated")} {formatDate(unit.statusUpdatedAt)}{unit.statusUpdatedByName ? ` · ${unit.statusUpdatedByName}` : ""}</p> : null}
      {unit.openCases ? <p><Link to={`/cases?${new URLSearchParams({ propertyCode: unit.propertyCode, unitCode: unit.code, status: "open" })}`}>{text(`${unit.openCases} phản ánh đang mở`, `${unit.openCases} open requests`)}</Link></p> : null}
      {data?.residents.length ? <div><h3>{text("Người thuê", "Tenants")}</h3><ul className="unit-residents">
        {data.residents.map(person => <li key={person._id}><Home size={14} aria-hidden="true" />{person.name} <small>{person.email}</small></li>)}</ul></div> : null}
      <form className="form-stack" onSubmit={submit}>
        {canLease ? <label className="field"><span>{text("Tình trạng thuê", "Letting status")}</span>
          <select value={occupancy} onChange={event => { setOccupancy(event.target.value as Occupancy); setRelease(false); }}>
            {(Object.keys(occupancyLabels) as Occupancy[]).map(key => <option key={key} value={key}>{occupancyLabels[key][locale]}</option>)}
          </select></label> : null}
        {releasing ? <label className="checkbox-row"><input type="checkbox" checked={release} onChange={event => setRelease(event.target.checked)} />
          {text(`Trả căn: gỡ ${unit.residentCount} người thuê khỏi căn`, `Check out: remove ${unit.residentCount} tenant(s)`)}</label> : null}
        <label className="field"><span>{text("Dọn dẹp / sửa chữa", "Cleaning / repair")}</span>
          <select value={readiness} onChange={event => setReadiness(event.target.value as Readiness)}>
            {(Object.keys(readinessLabels) as Readiness[]).map(key => <option key={key} value={key}>{readinessLabels[key][locale]}</option>)}
          </select></label>
        {canLease ? <label className="field"><span>{text("Ngày dự kiến trống / sẵn sàng", "Expected free / ready date")}</span>
          <input type="date" value={availableFrom} onChange={event => setAvailableFrom(event.target.value)} /></label> : null}
        <label className="field"><span>{text("Ghi chú", "Note")}</span>
          <textarea required minLength={3} maxLength={300} rows={2} value={note} onChange={event => setNote(event.target.value)}
            placeholder={text("Ví dụ: Đã dọn xong, kiểm tra điều hòa hoạt động tốt.", "e.g. Cleaned, air conditioner checked.")} /></label>
        {failure ? <p role="alert" className="form-error">{failure}</p> : null}
        <div><button className="button button-primary" disabled={busy}>{text("Lưu trạng thái", "Save status")}</button></div>
      </form>
      <div><h3>{text("Lịch sử trạng thái", "Status history")}</h3>
        {data?.history.length ? <ol className="unit-history">{data.history.map((item, index) => <li key={index}>
          <strong>{label(item.axis, item.from)} → {label(item.axis, item.to)}</strong>
          <span>{item.note}</span><small>{formatDate(item.at)}{item.actorName ? ` · ${item.actorName}` : ""}</small></li>)}</ol>
          : <p className="empty-note">{text("Chưa có thay đổi nào được ghi nhận.", "No changes recorded yet.")}</p>}
      </div>
    </div>
  </Modal>;
}
