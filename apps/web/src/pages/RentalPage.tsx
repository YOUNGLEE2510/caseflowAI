import { useState, type FormEvent } from "react";
import { Save } from "lucide-react";
import { api } from "../api";
import { useApiData } from "../hooks/useApiData";
import { useLocale } from "../i18n";
import { ErrorState, LoadingState, PageHeader } from "../components/ui";
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

export function RentalPage() {
  const { user } = useAuth();
  const canManage = ["manager", "org_admin", "platform_admin"].includes(user?.role || "");
  const { text, locale } = useLocale();
  const { data, error, loading, reload } = useApiData<Catalog>("/rental/catalog");
  const confirm = useConfirmation();
  const [kind, setKind] = useState("property");
  const [property, setProperty] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<{ cases: { code: string; title: string; status: string }[];
    tasks: { _id: string; title: string; status: string; result: string; dueAt: string }[] } | null>(null);
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
  return <div className="page-stack">
    <PageHeader title={text("Cơ sở và thiết bị", "Properties and assets")} />
    {loading ? <LoadingState /> : null}
    {error ? <ErrorState message={error} onRetry={reload} /> : null}
    {data ? <>
      <MaintenancePanel assets={data.assets} />
      {canManage ? <UnitQrPanel properties={data.properties} units={data.units} /> : null}
      {canManage ? <form className="page-stack" onSubmit={save}>
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
          <fieldset><legend>{text("Người thuê được phép gửi phản ánh", "Residents allowed to submit requests")}</legend>
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
        {message ? <p role="status">{message}</p> : null}
        <div><button className="button button-primary" disabled={busy}><Save size={16} />{text("Lưu danh mục", "Save catalog")}</button></div>
      </form> : null}
      <section className="page-stack">
        <h2>{text("Cơ sở", "Properties")}</h2>
        {data.properties.map(item => <p key={item.code}><strong>{item.code} · {item.name}</strong> · {item.address}</p>)}
        <h2>{text("Căn hộ", "Units")}</h2>
        {data.units.map(item => <p key={item.propertyCode + item.code}>{item.propertyCode} · {item.code} · {text("Tầng", "Floor")} {item.floor} · {item.residentIds?.length || 0} {text("người thuê", "residents")}</p>)}
        <h2>{text("Thiết bị", "Assets")}</h2>
        {data.assets.map(item => <div key={item.code}><span>{item.propertyCode} · {item.unitCode || text("Dùng chung", "Shared")} · {item.name}</span>{" "}
          {canManage ? <button type="button" className="text-link" onClick={async () => {
            try { setHistory(await api<NonNullable<typeof history>>(`/rental/assets/${encodeURIComponent(item.code)}/history`)); }
            catch (cause) { setMessage(cause instanceof Error ? cause.message : "Error"); }
          }}>{text("Lịch sử", "History")}</button> : null}</div>)}
        {history ? <div>
          {history.cases.map(item => <p key={item.code}>{item.code} · {item.title} · {item.status}</p>)}
          {history.tasks.map(item => <p key={item._id}>{item.title} · {new Date(item.dueAt).toLocaleString()} · {item.status} · {item.result}</p>)}
          {!history.cases.length && !history.tasks.length ? <p>{text("Chưa có lịch sử.", "No history.")}</p> : null}
        </div> : null}
      </section>
    </> : null}
  </div>;
}
