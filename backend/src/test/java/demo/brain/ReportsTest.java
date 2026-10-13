package demo.brain;
import org.junit.jupiter.api.Test;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import java.io.*;
import static org.assertj.core.api.Assertions.*;
class ReportsTest {
 @Test void oversizedUnicodeEvidenceRoundTripsWithoutTruncation() throws Exception {
  var tail=new StringBuilder();var random=new java.util.Random(17);for(int i=0;i<4000;i++)tail.append("승인 근거 ").append(random.nextLong());
  String original="가".repeat(31999)+"🚨"+tail;
  byte[] bytes;
  try(var book=new XSSFWorkbook();var out=new ByteArrayOutputStream()){
   var sheet=book.createSheet("audit");var cell=sheet.createRow(1).createCell(3);
   Reports.excelValue(book,cell,original);assertThat(cell.getStringCellValue()).contains("긴 텍스트");
   book.write(out);bytes=out.toByteArray();
  }
  try(var book=new XSSFWorkbook(new ByteArrayInputStream(bytes))){
   var parts=book.getSheet("긴 텍스트");var joined=new StringBuilder();
   for(int i=1;i<=parts.getLastRowNum();i++){var row=parts.getRow(i);assertThat(row.getCell(0).getStringCellValue()).isEqualTo("audit");assertThat(row.getCell(1).getStringCellValue()).isEqualTo("D2");assertThat(row.getCell(2).getNumericCellValue()).isEqualTo(i);String text=row.getCell(3).getStringCellValue();assertThat(text.length()).isLessThanOrEqualTo(32767);joined.append(text);}
   assertThat(joined.toString()).isEqualTo(original);
  }
 }
 @Test void cellLimitBoundaryAndFormulaLikeTextRemainLiteral() throws Exception {
  try(var book=new XSSFWorkbook()) {var cell=book.createSheet("events").createRow(0).createCell(0);String value="="+"x".repeat(32766);Reports.excelValue(book,cell,value);assertThat(cell.getStringCellValue()).isEqualTo(value);assertThat(cell.getCellType()).isEqualTo(org.apache.poi.ss.usermodel.CellType.STRING);assertThat(book.getNumberOfSheets()).isEqualTo(1);}
 }
}
