import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Building2, DoorOpen, History, QrCode, Save, Wrench, X } from "lucide-react";
import { api } from "../api";
import { useApiData } from "../hooks/useApiData";
import { useLocale } from "../i18n";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "../components/ui";
import { useConfirmation } from "../components/ConfirmationProvider";
import { categoryLabels } from "../utils/labels";
import { MaintenancePanel } from "../components/MaintenancePanel";
import { UnitQrPanel } from "../components/UnitQrPanel";
import { useAuth } from "../auth";

type Catalog = {
  properties: { code: string; name: string; address: string }[];
  units: { propertyCode: string; code: string; floor: string; residentIds: string[] }[];
  assets: { propertyCode: string; unitCode: string; code: string; name: string; category: string }[];
  residents: { _id: string; name: string }[];
};
type AssetHistory = {
  cases: { code: string; title: string; status: string }[];
  tasks: { _id: string; title: string; status: string; result: string; dueAt: string }[];
};
type TabKey = "repairs" | "qr" | "catalog";

export function RentalPage() {
  const { user } = useAuth();
  const canManage = ["manager", "org_admin", "platform_admin"].includes(user?.role || "");
  const { text, locale } = useLocale();
  const { data, error, loading, reload } = useApiData<Catalog>("/rental/catalog");
  const confirm = useConfirmation();
  const [params, setParams] = useSearchParams();
  const [kind, setKind] = useState("property");
  const [property, setProperty] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<{ asset: string; data: AssetHistory } | null>(null);

  const tabs: { key: TabKey; label: string; icon: typeof Wrench }[] = [
    { key: "repairs", label: text("Phiếu sửa chữa", "Repair tasks"), icon: Wrench },
    ...(canManage ? [{ key: "qr" as const, label: text("Mã QR theo căn", "Unit QR codes"), icon: QrCode }] : []),
    { key: "catalog", label: text("Danh mục", "Catalog"), icon: Building2 }
  ];
  const requested = params.get("tab") as TabKey | null;
  const active: TabKey = tabs.some(tab => tab.key === requested) ? requested! : "repairs";
  function selectTab(key: TabKey) {
    const next = new URLSearchParams(params);
    if (key === "repairs") next.delete("tab"); else next.set("tab", key);
    setParams(next, { replace: true });
  }
  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    const index = tabs.findIndex(tab => tab.key === active);
    const move = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!move) return;
    event.preventDefault();
    const next = tabs[(index + move + tabs.length) % tabs.length];
    selectTab(next.key);
    document.getElementById(`rental-tab-${next.key}`)?.focus();
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const values = Object.fromEntries(fields);
    const body = kind === "property" ? { kind, code: values.code, name: values.name, address: values.address } :
      kind === "unit" ? { kind, propertyCode: property, code: values.code, floor: values.floor, residentIds: fields.getAll("residentIds") } :
        { kind, propertyCode: property, code: values.code, name: values.name, category: values.category, unitCode: values.unitCode || undefined };
    if (!await confirm({ title: text("Lưu danh mục", "Save catalog"), message: text("Mã đã tồn tại sẽ được cập nhật.", "An existing code will be updated.") })) return;
    setBusy(true);
    setMessage("");
    try {
      await api("/rental/catalog", { method: "PUT", body: JSON.stringify(body) });
      setMessage(text("Đã lưu.", "Saved."));
      await reload();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : text("Không thể lưu.", "Save failed.")); }
    finally { setBusy(false); }
  }

  async function showHistory(code: string) {
    try { setHistory({ asset: code, data: await api<AssetHistory>(`/rental/assets/${encodeURIComponent(code)}/history`) }); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : text("Không tải được lịch sử.", "History unavailable.")); }
  }

  const propertyName = (code: string) => data?.properties.find(item => item.code === code)?.name || code;

  return <div className="page-stack rental-page">
    <PageHeader title={text("Cơ sở và thiết bị", "Properties and assets")} />
    {loading ? <LoadingState /> : null}
    {error ? <ErrorState message={error} onRetry={reload} /> : null}
    {data ? <>
      <div className="rental-summary" aria-label={text("Tổng quan danh mục", "Catalog summary")}>
        <div><Building2 size={18} aria-hidden="true" /><span>{text("Cơ sở", "Properties")}</span><strong>{data.properties.length}</strong></div>
        <div><DoorOpen size={18} aria-hidden="true" /><span>{text("Căn hộ", "Units")}</span><strong>{data.units.length}</strong></div>
        <div><Wrench size={18} aria-hidden="true" /><span>{text("Thiết bị", "Assets")}</span><strong>{data.assets.length}</strong></div>
      </div>

      <div className="segmented-tabs" role="tablist" aria-label={text("Khu vực quản lý", "Management area")}>
        {tabs.map(tab => <button key={tab.key} id={`rental-tab-${tab.key}`} type="button" role="tab" aria-selected={active === tab.key}
          aria-controls={`rental-panel-${tab.key}`} tabIndex={active === tab.key ? 0 : -1} onClick={() => selectTab(tab.key)} onKeyDown={onTabKey}>
          <tab.icon size={16} aria-hidden="true" />{tab.label}</button>)}
      </div>

      <div role="tabpanel" id={`rental-panel-${active}`} aria-labelledby={`rental-tab-${active}`} className="rental-tabpanel">
        {active === "repairs" ? <MaintenancePanel assets={data.assets} /> : null}
        {active === "qr" && canManage ? <UnitQrPanel properties={data.properties} units={data.units} /> : null}
        {active === "catalog" ? <div className={canManage ? "rental-catalog-layout" : "page-stack"}>
          <div className="page-stack">
            <section className="panel">
              <div className="panel-heading"><h2>{text("Cơ sở", "Properties")}</h2></div>
              {data.properties.length ? <div className="table-scroll"><table className="data-table">
                <thead><tr><th>{text("Mã", "Code")}</th><th>{text("Tên", "Name")}</th><th>{text("Địa chỉ", "Address")}</th></tr></thead>
                <tbody>{data.properties.map(item => <tr key={item.code}><td><strong>{item.code}</strong></td><td>{item.name}</td><td>{item.address || "—"}</td></tr>)}</tbody>
              </table></div> : <EmptyState title={text("Chưa có cơ sở", "No properties yet")} detail={text("Thêm cơ sở ở biểu mẫu bên cạnh.", "Add one with the form.")} />}
            </section>
            <section className="panel">
              <div className="panel-heading"><h2>{text("Căn hộ", "Units")}</h2></div>
              {data.units.length ? <div className="table-scroll"><table className="data-table">
                <thead><tr><th>{text("Căn", "Unit")}</th><th>{text("Cơ sở", "Property")}</th><th>{text("Tầng", "Floor")}</th><th>{text("Người thuê", "Residents")}</th></tr></thead>
                <tbody>{data.units.map(item => <tr key={item.propertyCode + item.code}><td><strong>{item.code}</strong></td><td>{propertyName(item.propertyCode)}</td><td>{item.floor || "—"}</td><td>{item.residentIds?.length || 0}</td></tr>)}</tbody>
              </table></div> : <EmptyState title={text("Chưa có căn hộ", "No units yet")} detail={text("Thêm căn hộ cho một cơ sở.", "Add units to a property.")} />}
            </section>
            <section className="panel">
              <div className="panel-heading"><h2>{text("Thiết bị", "Assets")}</h2></div>
              {data.assets.length ? <div className="table-scroll"><table className="data-table">
                <thead><tr><th>{text("Thiết bị", "Asset")}</th><th>{text("Vị trí", "Location")}</th><th>{text("Nhóm", "Category")}</th>{canManage ? <th><span className="sr-only">{text("Thao tác", "Actions")}</span></th> : null}</tr></thead>
                <tbody>{data.assets.map(item => <tr key={item.code}>
                  <td><strong>{item.name}</strong><small className="table-subtext">{item.code}</small></td>
                  <td>{item.propertyCode} · {item.unitCode || text("Dùng chung", "Shared")}</td>
                  <td>{categoryLabels[item.category]?.[locale] || item.category}</td>
                  {canManage ? <td className="table-actions"><button type="button" className="button button-secondary button-small" onClick={() => void showHistory(item.code)}><History size={14} />{text("Lịch sử", "History")}</button></td> : null}
                </tr>)}</tbody>
              </table></div> : <EmptyState title={text("Chưa có thiết bị", "No assets yet")} detail={text("Thêm thiết bị để theo dõi sửa chữa.", "Add assets to track repairs.")} />}
              {history ? <div className="asset-history" aria-live="polite">
                <div className="asset-history-heading"><h3>{text("Lịch sử thiết bị", "Asset history")} · {history.asset}</h3>
                  <button type="button" className="icon-button" aria-label={text("Đóng lịch sử", "Close history")} onClick={() => setHistory(null)}><X size={16} /></button></div>
                {history.data.cases.map(item => <p key={item.code}><strong>{item.code}</strong> · {item.title} · {item.status}</p>)}
                {history.data.tasks.map(item => <p key={item._id}>{item.title} · {new Date(item.dueAt).toLocaleString()} · {item.status}{item.result ? ` · ${item.result}` : ""}</p>)}
                {!history.data.cases.length && !history.data.tasks.length ? <p>{text("Chưa có lịch sử.", "No history.")}</p> : null}
              </div> : null}
            </section>
          </div>

          {canManage ? <form className="panel rental-catalog-form" onSubmit={save}>
            <div className="panel-heading"><div><span className="eyebrow">{text("Mã trùng sẽ được cập nhật", "Existing codes are updated")}</span><h2>{text("Thêm hoặc cập nhật", "Add or update")}</h2></div></div>
            <div className="rental-form-body">
              <label className="field"><span>{text("Loại", "Type")}</span><select value={kind} onChange={event => setKind(event.target.value)}>
                <option value="property">{text("Cơ sở", "Property")}</option><option value="unit">{text("Căn hộ", "Unit")}</option><option value="asset">{text("Thiết bị", "Asset")}</option>
              </select></label>
              {kind !== "property" ? <label className="field"><span>{text("Cơ sở", "Property")}</span><select required value={property} onChange={event => setProperty(event.target.value)}>
                <option value="">{text("Chọn cơ sở", "Select property")}</option>{data.properties.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label> : null}
              <label className="field"><span>{text("Mã", "Code")}</span><input name="code" required pattern="[A-Za-z0-9\-]{1,32}" maxLength={32} /></label>
              {kind !== "unit" ? <label className="field"><span>{text("Tên", "Name")}</span><input name="name" required minLength={2} maxLength={120} /></label> : null}
              {kind === "property" ? <label className="field"><span>{text("Địa chỉ", "Address")}</span><input name="address" maxLength={240} /></label> : null}
              {kind === "unit" ? <>
                <label className="field"><span>{text("Tầng", "Floor")}</span><input name="floor" maxLength={16} /></label>
                <fieldset className="resident-picker"><legend>{text("Người thuê được phép gửi phản ánh", "Residents allowed to submit requests")}</legend>
                  {data.residents.map(person => <label key={person._id} className="checkbox-row"><input type="checkbox" name="residentIds" value={person._id} />{person.name}</label>)}
                </fieldset>
              </> : null}
              {kind === "asset" ? <>
                <label className="field"><span>{text("Căn hộ", "Unit")}</span><select name="unitCode"><option value="">{text("Dùng chung", "Shared")}</option>
                  {data.units.filter(item => item.propertyCode === property).map(item => <option key={item.code} value={item.code}>{item.code}</option>)}</select></label>
                <label className="field"><span>{text("Nhóm", "Category")}</span><select name="category">
                  {["water", "electrical", "internet", "appliances", "access_security", "general_support"].map(key => <option key={key} value={key}>{categoryLabels[key][locale]}</option>)}
                </select></label>
              </> : null}
              {message ? <p role="status" className="form-hint">{message}</p> : null}
              <button className="button button-primary" disabled={busy}><Save size={16} />{text("Lưu danh mục", "Save catalog")}</button>
            </div>
          </form> : null}
        </div> : null}
      </div>
    </> : null}
  </div>;
}
