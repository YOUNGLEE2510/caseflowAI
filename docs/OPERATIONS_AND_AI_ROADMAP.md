# Nang cap nang suat van hanh va AI

## Muc tieu

Giam thao tac lap, giam chuyen sai doi, phat hien ho so bi tac va cung cap cau tra loi co can cu. Khong toi da hoa so ho so moi nhan bang cach bo qua chat luong, bao mat hoac qua tai nhan vien.

## Thu tu trien khai san pham (chua danh dau hoan thanh)

### Da trien khai dot van hanh 10/09/2026

- Hang doi: chua phan cong, giao cho toi, qua han, den han trong 24 gio; giu bo loc tren URL, phan trang va sap xep deadline on dinh. Khong bao gom ho so da dong/giai quyet.
- Goi y phan cong ngay trong chi tiet: chi nhan vien active cung tenant va doi; xep hang theo chua day tai, ky nang khop service key/category, ty le tai va so ho so qua han. Hien thi open/capacity va overdue.
- Nhan vien xac nhan bang thao tac giao ho so hien co, giu phan quyen, audit va optimistic concurrency. Du lieu tai la snapshot, khong phai dat cho; chua co khoa WIP nguyen tu giua nhieu ho so. Lua chon phan cong thu cong van duoc giu.
- Sua khoi phuc phien: loi tam thoi khong xoa token; hien loi va cho thu lai.
- Gioi han API cau hinh bang API_RATE_LIMIT_PER_MINUTE, mac dinh 100; E2E dung 1000 vi cac kich ban dung chung IP.

Chua trien khai trong dot nay: saved filters, nhan vien san sang/nghi phep, SLA worker, thao tac hang loat, retraining model production.

1. Hang doi cong viec: bo loc da luu, ho so chua co nguoi phu trach, gan den han, cho phan hoi; sap xep co ly do ro rang.
2. Goi y phan cong: loc theo don vi, ky nang, trang thai san sang; xep hang theo tai cong viec va gioi han WIP. Con nguoi xac nhan; ghi audit; cap nhat nguyen tu de tranh phan cong trung.
3. SLA theo lich lam viec: ngay nghi, tam dung co ly do, deadline theo dich vu; worker nhac han/chuyen cap co retry va chong gui lap.
4. Thao tac hang loat: xem truoc pham vi, kiem tra quyen tung ho so, thong bao thanh cong/that bai tung muc, xu ly xung dot phien ban.
5. Ho tro nhan vien: tim ho so tuong tu, tom tat timeline, goi y tra loi co nguon va ngay hieu luc; khong tu gui cho nguoi yeu cau.
6. Gom su co: tuong dong + cua so thoi gian + tan suat, nguoi duyet cum; cap nhat nhieu ho so nhung khong lo thong tin giua nguoi yeu cau/tenant.

## Lo trinh du lieu va model

- Da trien khai: tai MASSIVE vi-VN, provenance/checksum, loai trung, benchmark word TF-IDF LR/SVM va character TF-IDF LR. Chon model theo validation, test chi danh gia model duoc chon.
- Chua trien khai: thay production classifier, PhoBERT fine-tuning, semantic retrieval, auto-assignment.
- Du lieu mo la benchmark/nguon hoc ngon ngu, khong tu dong tro thanh nhan nghiep vu.
- Du lieu dich hoac synthetic can nhan provenance rieng; khong dung de khang dinh hieu qua tren nguoi dung that.
- Tao corpus CaseFlow qua hang doi gan nhan: source, quyen su dung, text da an danh, service key, nguoi duyet, thoi diem, nhom hoi thoai. Chia tap theo hoi thoai/nguon/thoi gian truoc augmentation.
- So sanh baseline voi encoder tieng Viet tren cung tap khoa. Chi dua model vao shadow mode sau khi co ket qua; chi phat hanh sau duyet, co rollback.
- RAG: dung tai lieu cua to chuc da duyet va con hieu luc. Khong dung QA tren Internet nhu quy dinh cua to chuc.
- SLA: can snapshot tai thoi diem du doan va ket qua thuc te, khong dua thong tin tuong lai vao feature. Chua du nhan thi dung quy tac minh bach.

## Tieu chi nghiem thu

Do thoi gian phan luong, ty le chuyen sai doi, so lan nhan vien sua AI, ho so qua han, thoi gian phan hoi dau tien, latency p95 va loi API. Do truoc/sau tren cung kieu tac vu; khong cong bo ty le cai thien khi chua co thu nghiem.

## Chay pipeline nghien cuu

```powershell
python -m pip install -r apps/ai/requirements-research.txt
python -m apps.ai.open_data prepare
python -m apps.ai.open_data benchmark
python -m pytest apps/ai/tests -q
```

Du lieu va bao cao o `artifacts/open-data/massive-vi`; khong hien thi trong UI demo, khong ghi vao MongoDB, khong tu dong nap model vao API.
