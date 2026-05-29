# 💊 Drug Scanner

**Drug Scanner** là một ứng dụng web (PWA) hiện đại giúp tra cứu thông tin thuốc nhanh chóng và chính xác bằng cách quét nhãn thuốc hoặc mã vạch thông qua camera. Ứng dụng kết hợp sức mạnh của AI (Gemini) và cơ sở dữ liệu dược phẩm uy tín (openFDA).

![Drug Scanner Screenshot](/public/OG.png)

## ✨ Tính năng chính

- **🔍 Quét đa năng**: Chụp ảnh mặt trước (tên thuốc) và mặt sau/mã vạch để nhận diện toàn diện.
- **🤖 Phân tích bằng AI**: Sử dụng mô hình **Google Gemini-1.5-Flash** để trích xuất thông tin chi tiết từ hình ảnh.
- **📚 Dữ liệu tin cậy**: Tích hợp API **openFDA** để đối chiếu và bổ sung thông tin chính thống.
- **📄 Xuất báo cáo**: Cho phép xuất kết quả dưới dạng file **PDF** chuyên nghiệp hoặc lưu dưới dạng **Ảnh**.
- **📱 Trải nghiệm PWA**:
  - Cài đặt trực tiếp trên điện thoại/máy tính (Add to Home Screen).
  - Khởi động nhanh, mượt mà như ứng dụng bản địa.
  - Chế độ ngoại tuyến cơ bản.
- **🔒 Bảo mật**: Khóa API Gemini được lưu trữ an toàn trong IndexedDB của trình duyệt, không thông qua server trung gian.

## 🚀 Công nghệ sử dụng

- **Frontend**: HTML5, CSS3 (Modern Vanilla), JavaScript (ES Modules).
- **Backend**: Node.js, Express (chủ yếu phục vụ API và static files).
- **AI/ML**: Google Generative AI SDK (Gemini).
- **APIs**: openFDA API.
- **Thư viện**: 
  - [jsPDF](https://github.com/parallax/jsPDF) cho việc tạo PDF.
  - [html2canvas](https://html2canvas.hertzen.com/) để chụp ảnh kết quả.

## 🛠️ Cài đặt & Chạy local

### Yêu cầu
- Node.js (phiên bản 18 trở lên).

### Các bước thực hiện

1. **Clone repository**:
   ```bash
   git clone https://github.com/your-username/drug-scanner.git
   cd drug-scanner
   ```

2. **Cài đặt dependencies**:
   ```bash
   npm install
   ```

3. **Chạy ứng dụng**:
   ```bash
   npm run dev
   ```
   Ứng dụng sẽ chạy tại: `http://localhost:3001`

4. **Cấu hình API Key**:
   - Truy cập [Google AI Studio](https://aistudio.google.com/app/apikey) để lấy khóa API miễn phí.
   - Nhập khóa vào phần cài đặt (biểu tượng ⚙️) trong ứng dụng.

## 📖 Hướng dẫn sử dụng

1. Mở ứng dụng và nhấn nút **SCAN**.
2. **Bước 1**: Chụp ảnh mặt trước của vỉ hoặc hộp thuốc (nơi ghi tên thuốc rõ nhất).
3. **Bước 2**: Chụp ảnh mặt sau hoặc phần có mã vạch.
4. Chờ AI phân tích và xem kết quả chi tiết về: Thành phần, Công dụng, Liều dùng, Chống chỉ định và Cảnh báo.
5. Sử dụng nút **Xuất PDF** hoặc **Tải ảnh** để lưu lại thông tin.

## ⚠️ Lưu ý quan trọng (Disclaimer)

*Thông tin do ứng dụng cung cấp chỉ mang tính chất tham khảo dựa trên phân tích hình ảnh của AI và dữ liệu mở. **Tuyệt đối không tự ý dùng thuốc** dựa trên kết quả này mà không có sự chỉ định của bác sĩ hoặc dược sĩ chuyên môn. Luôn kiểm tra kỹ đơn thuốc và hướng dẫn sử dụng kèm theo của nhà sản xuất.*

---
Phát triển bởi [Quyetnm](https://github.com/quyetnm)
