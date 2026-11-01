package demo.brain;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
class CampusRoomTest {
 final ObjectMapper json=new ObjectMapper();
 @Test void colleaguesTravelIndependentlyAndCannotStartSharedFaults()throws Exception{
  WarRoom room=new WarRoom(null,null,null,true);
  var a=room.join("campus-test",null);var b=room.join("campus-test",null);
  var one=room.connect(a.get("ticket").toString(),"one");var two=room.connect(b.get("ticket").toString(),"two");
  assertThat(one.floor).isEqualTo(1);assertThat(two.floor).isEqualTo(1);assertThat(Math.hypot(one.x-two.x,one.z-two.z)).isGreaterThanOrEqualTo(.65);
  room.input("one",json.readTree("{\"type\":\"campus-portal\",\"world\":4}"));assertThat(one.floor).isEqualTo(5);assertThat(two.floor).isEqualTo(1);
  room.input("two",json.readTree("{\"type\":\"campus-portal\",\"world\":4}"));assertThat(two.floor).isEqualTo(5);assertThat(Math.hypot(one.x-two.x,one.z-two.z)).isGreaterThanOrEqualTo(.65);
  room.input("one",json.readTree("{\"type\":\"chat\",\"text\":\"데이터 확인\"}"));
  assertThat(room.state("campus-test").toString()).contains("데이터 확인");
  for(String type:new String[]{"training","floor","city-visit","inspect"})assertThatThrownBy(()->room.input("one",json.readTree("{\"type\":\""+type+"\"}"))).isInstanceOf(IllegalArgumentException.class);
  assertThatThrownBy(()->room.input("one",json.readTree("{\"type\":\"campus-portal\",\"world\":5}"))).isInstanceOf(IllegalArgumentException.class);assertThat(one.floor).isEqualTo(5);
  room.input("one",json.readTree("{\"type\":\"campus-portal\",\"world\":0}"));assertThat(one.floor).isEqualTo(1);
 }
}
