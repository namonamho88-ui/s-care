package demo.brain;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.jdbc.datasource.DelegatingDataSource;
import javax.sql.DataSource;
import java.sql.*;
import java.lang.reflect.*;

/** Opt-in latency injection against the benchmark's disposable H2 only, not a production estimate. */
@TestConfiguration
class BenchmarkJdbcLatency {
 static volatile boolean enabled;
 static final long delayMs=Long.getLong("benchmarkJdbcLatencyMs",0);
 @Bean static BeanPostProcessor benchmarkJdbcLatency(){return new BeanPostProcessor(){
  @Override public Object postProcessAfterInitialization(Object bean,String name){
   if(bean instanceof DataSource source){
    return new DelegatingDataSource(source){
     @Override public Connection getConnection()throws SQLException{return wrap(super.getConnection(),Connection.class);}
     @Override public Connection getConnection(String user,String password)throws SQLException{return wrap(super.getConnection(user,password),Connection.class);}
    };
   }
   return bean;
  }
 };}
 @SuppressWarnings("unchecked") private static <T>T wrap(T target,Class<T> type){
  return (T)Proxy.newProxyInstance(type.getClassLoader(),new Class<?>[]{type},(proxy,method,args)->{
   if(enabled&&delayMs>0&&(method.getName().startsWith("execute")||method.getName().equals("commit")))Thread.sleep(delayMs);
   try{
    Object result=method.invoke(target,args);
    if(result instanceof CallableStatement statement)return wrap(statement,CallableStatement.class);
    if(result instanceof PreparedStatement statement)return wrap(statement,PreparedStatement.class);
    if(result instanceof Statement statement)return wrap(statement,Statement.class);
    return result;
   }catch(InvocationTargetException e){throw e.getCause();}
  });
 }
}
