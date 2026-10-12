package demo.brain;
import org.springframework.stereotype.Service;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.ss.usermodel.*;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import java.io.*;
import java.util.*;
@Service
public class Reports {
 private final Store s;public Reports(Store s){this.s=s;}
 private Map<String,Object> ready(String id){var i=s.incident(id);if(!List.of("RESOLVED","CLOSED").contains(i.get("status")))throw new IllegalStateException("복구 검증 후 보고서를 다운로드할 수 있습니다.");return i;}
 private LinkedHashMap<String,String> content(String id){var i=ready(id);var data=new LinkedHashMap<String,String>();data.put("장애 번호",id);data.put("제목",i.get("title").toString());data.put("가상 시스템",String.valueOf(i.get("system_name")));data.put("구성요소",i.get("asset_name").toString());data.put("상태 / 심각도",i.get("status")+" / "+i.get("severity"));data.put("담당자",i.get("owner_name")+" / "+i.get("department"));data.put("발생 / 복구",i.get("created_at")+" / "+i.get("resolved_at"));data.put("관측",i.get("observations").toString());data.put("판단",String.valueOf(i.get("decision_json")));data.put("영향 분석",String.valueOf(i.get("impact_json")));data.put("조치 후기",i.get("notes").toString());data.put("재발 방지",i.get("prevention").toString());return data;}
 public byte[] xlsx(String id)throws IOException{return xlsx(id,true);}
 public byte[] xlsx(String id,boolean includeAudit)throws IOException{var data=content(id);try(var book=new XSSFWorkbook();var out=new ByteArrayOutputStream()){
  var sheet=book.createSheet("장애 보고서");var header=book.createCellStyle();header.setFillForegroundColor(IndexedColors.DARK_BLUE.getIndex());header.setFillPattern(FillPatternType.SOLID_FOREGROUND);var font=book.createFont();font.setColor(IndexedColors.WHITE.getIndex());font.setBold(true);header.setFont(font);var wrap=book.createCellStyle();wrap.setWrapText(true);wrap.setVerticalAlignment(VerticalAlignment.TOP);
  var title=sheet.createRow(0);title.createCell(0).setCellValue("S-CARE");title.createCell(1).setCellValue("100% 가상 데이터 · 실제 시스템 변경 없음");for(var cell:title)cell.setCellStyle(header);int n=1;for(var e:data.entrySet()){var r=sheet.createRow(n++);r.createCell(0).setCellValue(e.getKey());r.createCell(1).setCellValue(e.getValue());r.getCell(1).setCellStyle(wrap);r.setHeightInPoints(Math.min(300,30+e.getValue().length()/60*14));}sheet.setColumnWidth(0,24*256);sheet.setColumnWidth(1,100*256);sheet.createFreezePane(0,1);
  for(String table:includeAudit?List.of("events","audit","agent_tasks"):List.of("events","agent_tasks")){var tab=book.createSheet(table);var rows=s.db.queryForList("SELECT * FROM "+table+" WHERE incident_id=? ORDER BY created_at",id);if(rows.isEmpty())continue;var keys=new ArrayList<>(rows.get(0).keySet());var head=tab.createRow(0);for(int c=0;c<keys.size();c++){head.createCell(c).setCellValue(keys.get(c));head.getCell(c).setCellStyle(header);tab.setColumnWidth(c,32*256);}n=1;for(var row:rows){var r=tab.createRow(n++);for(int c=0;c<keys.size();c++)r.createCell(c).setCellValue(Objects.toString(row.get(keys.get(c)),""));}tab.createFreezePane(0,1);}
  book.write(out);return out.toByteArray();}}
 public byte[] pdf(String id) throws IOException {
  var incident = ready(id);
  var decision = s.json.valueToTree(s.decode(incident.get("decision_json")));
  var impact = s.json.valueToTree(s.decode(incident.get("impact_json")));
  try (var doc = new PDDocument(); var out = new ByteArrayOutputStream();
       var fontStream = getClass().getResourceAsStream("/fonts/NanumGothic-Regular.ttf")) {
   var font = PDType0Font.load(doc, fontStream);
   try (var writer = new PdfWriter(doc, font, id)) {
    writer.section("01  장애 개요");
    writer.field("제목", incident.get("title"));
    writer.field("시스템 / 구성요소", incident.get("system_name") + " / " + incident.get("asset_name"));
    writer.field("상태 / 심각도 / 담당자", incident.get("status") + " / " + incident.get("severity") + " / " + incident.get("owner_name") + " (" + incident.get("department") + ")");
    writer.field("발생 / 복구 (KST)", time(incident.get("created_at")) + " / " + time(incident.get("resolved_at")));
    writer.field("관측", incident.get("observations"));
    writer.section("02  Jev 판단과 근거");
    writer.field("사용 Provider / 모델", decision.path("provider").asText("기록 없음") + " / " + decision.path("model").asText("기록 없음"));
    writer.field("결과 구분", decision.path("provider").asText().equals("OPERATOR") ? "담당자 직접 판단" : !decision.path("simulated").asBoolean() && List.of("LOCAL_JEV", "TYPESAFE_JEV").contains(decision.path("provider").asText()) ? "실제 AI 모델 판단" : "시뮬레이션 결과 - 실제 AI 판단 아님");
    writer.field("분류 / 우선순위 / 추천 부서", decision.path("type").asText() + " / " + decision.path("severity").asText() + " / " + decision.path("department").asText());
    writer.field("신뢰도 / 근거 충분도 / 실행시간", String.format(Locale.ROOT, "%.1f%% / %.1f%% / %,d ms", decision.path("confidence").asDouble() * 100, decision.path("evidenceScore").asDouble() * 100, decision.path("latencyMs").asLong()));
    writer.field("재발 의심 / 담당자 확인 필요", (decision.path("recurrence").asBoolean() ? "예" : "아니오") + " / " + (decision.path("needsReview").asBoolean() ? "예" : "아니오"));
    if (decision.path("fallback").asBoolean()) writer.field("대체 실행 사유", decision.path("fallbackReason").asText());
    for (var evidence : decision.path("evidence")) writer.field("판단 근거", evidence.asText());
    writer.section("03  영향 범위와 승인");
    var assets = new ArrayList<String>();
    for (var asset : impact.path("affected")) assets.add(asset.asText());
    writer.field("Ontology", impact.path("engine").asText("기록 없음") + " / 발생 지점 " + impact.path("root").asText() + " / 영향 가능 자산 " + assets.size() + "개");
    writer.field("연결 자산", String.join(", ", assets));
    for (var approval : s.db.queryForList("SELECT * FROM approvals WHERE incident_id=?", id))
     writer.field("대응 승인", approval.get("actor") + " / " + time(approval.get("created_at")) + " / " + approval.get("reason"));
    writer.section("04  복구 검증과 재발 방지");
    var metrics = s.db.queryForList("SELECT * FROM simulated_metrics WHERE incident_id=?", id);
    if (!metrics.isEmpty()) {
     var before = s.json.valueToTree(s.decode(metrics.get(0).get("before_json")));
     var after = s.json.valueToTree(s.decode(metrics.get(0).get("current_json")));
     writer.field("가상 지표 변화", "오류율 " + before.path("errorRate").asText() + "% → " + after.path("errorRate").asText() + "% / 응답 시간 " + before.path("latencyMs").asText() + " ms → " + after.path("latencyMs").asText() + " ms");
     writer.field("검증 기록", "정상 의존성: " + after.path("healthyDependencies").asBoolean() + " / 가상 조치 적용: " + metrics.get(0).get("applied"));
    }
    String notes = incident.get("notes").toString();
    if (notes.startsWith("{")) {
     try {
      var proof = s.json.readTree(notes);
      if (proof.path("provider").asText().equals("SIMULATED_METRICS") && proof.path("passed").asBoolean())
       notes = "가상 복구 지표와 의존성 검증을 완료했습니다. 상세 증적은 감사 로그와 Excel을 참조하세요.";
     } catch (com.fasterxml.jackson.core.JsonProcessingException ignored) { /* Preserve the operator's text. */ }
    }
    writer.field("조치 후기", notes);
    writer.field("재발 방지", incident.get("prevention"));
    writer.section("05  실행 타임라인");
    for (var event : s.db.queryForList("SELECT stage,state,message,created_at FROM events WHERE incident_id=? AND state<>'RUNNING' ORDER BY id", id))
     writer.field(event.get("stage") + " / " + event.get("state"), time(event.get("created_at")) + " - " + event.get("message"));
   }
   for (int n = 0; n < doc.getNumberOfPages(); n++) {
    try (var footer = new PDPageContentStream(doc, doc.getPage(n), PDPageContentStream.AppendMode.APPEND, true)) {
     footer.setNonStrokingColor(new java.awt.Color(105, 120, 140));
     footer.beginText(); footer.setFont(font, 8); footer.newLineAtOffset(48, 30);
     footer.showText(id + "   |   100% 가상 데이터   |   " + (n + 1) + " / " + doc.getNumberOfPages()); footer.endText();
    }
   }
   doc.save(out); return out.toByteArray();
  }
 }

 private static String time(Object value) {
  if (value instanceof java.sql.Timestamp timestamp)
   return java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(java.time.ZoneId.of("Asia/Seoul")).format(timestamp.toInstant());
  return Objects.toString(value, "-");
 }

 private static class PdfWriter implements AutoCloseable {
  private final PDDocument doc;
  private final PDType0Font font;
  private final String id;
  private PDPageContentStream canvas;
  private float y;
  private final java.awt.Color navy = new java.awt.Color(17, 35, 57);
  private final java.awt.Color ink = new java.awt.Color(48, 60, 76);
  PdfWriter(PDDocument doc, PDType0Font font, String id) throws IOException {
   this.doc = doc; this.font = font; this.id = id; page();
  }
  private void page() throws IOException {
   if (canvas != null) canvas.close();
   var page = new PDPage(org.apache.pdfbox.pdmodel.common.PDRectangle.A4); doc.addPage(page);
   canvas = new PDPageContentStream(doc, page);
   canvas.setNonStrokingColor(navy); canvas.addRect(0, 746, 596, 96); canvas.fill();
   text("S-CARE", 10, 48, 812, java.awt.Color.WHITE);
   text("장애 보고서", 24, 48, 777, java.awt.Color.WHITE);
   text("FICTIONAL DATA / " + id, 8, 48, 727, ink);
   y = 700;
  }
  private void ensure(float height) throws IOException { if (y - height < 58) page(); }
  void section(String title) throws IOException {
   ensure(85); y -= 10;
   canvas.setNonStrokingColor(new java.awt.Color(235, 243, 249)); canvas.addRect(43, y - 8, 509, 27); canvas.fill();
   text(title, 12, 50, y, navy); y -= 32;
  }
  void field(String label, Object value) throws IOException {
   var lines = wrap(Objects.toString(value, "-"));
   ensure(23 + Math.min(lines.size(), 3) * 14);
   text(label, 9, 48, y, new java.awt.Color(69, 103, 127)); y -= 16;
   for (String line : lines) { ensure(14); text(line, 10, 48, y, ink); y -= 14; }
   y -= 10;
  }
  private List<String> wrap(String value) throws IOException {
   var lines = new ArrayList<String>(); var line = new StringBuilder();
   for (int cp : value.replaceAll("[\\r\\n\\t]", " ").codePoints().toArray()) {
    String ch = new String(Character.toChars(cp));
    try { font.getStringWidth(ch); } catch (IllegalArgumentException unsupported) { ch = "?"; }
    if (font.getStringWidth(line + ch) * 10 / 1000 > 495) { lines.add(line.toString()); line.setLength(0); }
    line.append(ch);
   }
   if (!line.isEmpty()) lines.add(line.toString()); return lines;
  }
  private void text(String value, float size, float x, float top, java.awt.Color color) throws IOException {
   canvas.setNonStrokingColor(color); canvas.beginText(); canvas.setFont(font, size); canvas.newLineAtOffset(x, top); canvas.showText(value); canvas.endText();
  }
  public void close() throws IOException { if (canvas != null) canvas.close(); }
 }
}
