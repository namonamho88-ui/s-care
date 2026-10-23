package demo.brain;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import static org.assertj.core.api.Assertions.*;

class SmsParserTest {
 final SmsParser parser=new SmsParser();
 static final String ABEND="[Web발신]\n[운영]ABEND: DEMO_BATCH_001 가상정산배치.. 20261007 2026-10-07 14:57:40";
 static final String NORMAL="[Web발신]\n[운영]END_OK: DEMO_BATCH_003[배치ID] 가상정산배치[배치명] 20261011 2026-10-11 10:51:31";
 static final String DELAY="[Web발신]\n[운영]DELAY_END: DEMO_BATCH_002 가상환율배치.. 20261009 MUST BE END BY 11:00!";
 static final String TMS="""
  [Web발신]
  [가상금융회사] TMS 온라인 비즈니스오류 임계치 초과 알림
  ▶ IF아이디 : [DEMO_IF_001]
  ▶ IF명 : [[개인]가상 해외예약목록조회]
  ▶ 업무코드 : [DEMO]
  ▶ 서비스코드 : [DEMO_SVC_001]
  ▶ 대외기관 : [-]
  ▶ 거래일자 : [20261008]
  ▶ 거래시간 : [1550~1650](1시간)
  ▶ 거래집계일시 : [2026-10-08 16:52:41]
  ▶ 비교일수 : [5](영업일)동시간대
  ▶ 비교기간평균거래건수 : [82]
  ▶ 비교기간평균오류건수 : [47]
  ▶ 비교기간평균오류율 : [57.35]%
  ▶ 오류율임계치 : [95]%
  ▶ 현재거래건수 : [46]
  ▶ 현재오류건수 : [44]
  ▶ 현재오류율 : [95.65]%
  ▶ 메시지 수신자 : [가상수신자A, 가상수신자B]
  ▶ 메시지 발생일시 : [2026-10-08 17:04:12]
  """;
 @Test void normalIsExcludedAndOptionalLabelsAreRemoved(){var p=parser.parse(NORMAL);assertThat(p.eligible()).isFalse();assertThat(p.fields()).containsEntry("배치ID","DEMO_BATCH_003").containsEntry("배치명","가상정산배치");}
 @Test void abendPreservesTruncatedNameAndReportedTimestamp(){var p=parser.parse(ABEND);assertThat(p.eligible()).isTrue();assertThat(p.fields()).containsEntry("배치명","가상정산배치..").containsEntry("발생일시","2026-10-07 14:57:40");assertThat(p.warnings()).anyMatch(w->w.contains("생략"));}
 @Test void delayDeadlineIsNotInventedOccurrenceTime(){var p=parser.parse(DELAY);assertThat(p.eligible()).isTrue();assertThat(p.fields()).containsEntry("종료기한","11:00").doesNotContainKey("발생일시");assertThat(p.observations()).doesNotContain("2026-10-09 11:00");}
 @Test void tmsExtractsNestedNameAndReportedMetricsWithoutRecipients(){var p=parser.parse(TMS);assertThat(p.eligible()).isTrue();assertThat(p.fields()).containsEntry("IF명","[개인]가상 해외예약목록조회").containsEntry("임계치 초과폭","0.65%p").containsEntry("비교기간평균오류율","57.35").containsEntry("비교일수","5");assertThat(p.toString()+p.observations()).doesNotContain("가상금융회사","가상수신자A","가상수신자B");}
 @Test void fingerprintIgnoresFormattingAndRecipientChangesButDistinguishesEvents(){assertThat(parser.parse(TMS.replace("\n","\r\n").replace("가상수신자A","다른가상수신자")).fingerprint()).isEqualTo(parser.parse(TMS).fingerprint());assertThat(parser.parse(TMS.replace("17:04:12","17:05:12")).fingerprint()).isNotEqualTo(parser.parse(TMS).fingerprint());}
 @Test void contradictoryThresholdIsHeldForReview(){var p=parser.parse(TMS.replace("[95]%","[99]%"));assertThat(p.eligible()).isFalse();assertThat(p.status()).isEqualTo("REVIEW_REQUIRED");}
 @Test void duplicateFieldsAndMultipleMessagesAreRejected(){assertThatThrownBy(()->parser.parse(TMS+"\n▶ IF아이디 : [DEMO_IF_002]")).isInstanceOf(IllegalArgumentException.class);assertThatThrownBy(()->parser.parse(ABEND+"\n"+NORMAL)).isInstanceOf(IllegalArgumentException.class);}
 @ParameterizedTest @ValueSource(strings={"20261307","20260230","20260001"}) void impossibleDatesAreRejected(String date){assertThatThrownBy(()->parser.parse(ABEND.replace("20261007",date))).isInstanceOf(IllegalArgumentException.class);}
 @ParameterizedTest @ValueSource(strings={"24:00","11:60","-1:00"}) void invalidDeadlineIsRejected(String clock){assertThatThrownBy(()->parser.parse(DELAY.replace("11:00",clock))).isInstanceOf(IllegalArgumentException.class);}
 @ParameterizedTest @ValueSource(strings={"101","NaN","-2","95.1"}) void invalidOrInconsistentCurrentRatesAreRejected(String rate){assertThatThrownBy(()->parser.parse(TMS.replace("95.65",rate))).isInstanceOf(IllegalArgumentException.class);}
 @Test void unknownMissingOrOversizedInputsAreRejected(){for(String input:new String[]{"hello",ABEND.replace("ABEND","UNKNOWN"),TMS.replace("▶ IF아이디 : [DEMO_IF_001]",""),"x".repeat(10001),TMS.replace("[44]","[47]"),TMS.replace("1550~1650","2550~1650")})assertThatThrownBy(()->parser.parse(input)).isInstanceOf(IllegalArgumentException.class);}
 @Test void batchErrorDetailsSurviveParsingWithoutRecipientsOrSecrets(){
  var p=parser.parse(ABEND+"\n오류코드: ORA-00060 오류내용: deadlock detected token=fictional-secret 수신자: 가상수신자");
  assertThat(p.fields().get("오류 상세")).contains("ORA-00060","deadlock","[비공개]").doesNotContain("가상수신자","fictional-secret");
  assertThat(RecoverySimulation.plan(p.observations(),"APPLICATION",true)).containsEntry("profile","LOCK");
  assertThat(parser.parse(DELAY+" 오류내용: execution timeout").fields()).containsKey("오류 상세");
 }
}
