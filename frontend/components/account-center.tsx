"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
type Row = Record<string, any>;
export default function AccountCenter({ user, operators, api, onPasswordChanged }: { user: Row; operators: Row[]; api: (path: string, method?: string, body?: any) => Promise<any>; onPasswordChanged: () => void }) {
  const [users, setUsers] = useState<Row[]>([]), [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const [login, setLogin] = useState(""), [name, setName] = useState(""), [role, setRole] = useState("USER"), [operator, setOperator] = useState("");
  const [invitation, setInvitation] = useState<Row | null>(null), [oldPassword, setOldPassword] = useState(""), [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState<Row | null>(null);
  const admin = user.role === "ADMIN";
  const refresh = async () => setUsers(await api("/auth/users"));
  useEffect(() => { if (admin) refresh().catch(e => setError(e.message)); }, [admin]);
  async function action(fn: () => Promise<void>) { setBusy(true); setError(""); setNotice(""); try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <div className="account-center">
    {error && <div className="banner error" role="alert">{error}</div>}
    {notice && <div className="banner good" role="status">{notice}</div>}
    <section className="panel"><div className="panel-body">
      <h2>내 계정</h2><p className="muted mt-3">{user.displayName} · {admin ? "관리자" : "일반 사용자"} · {user.login}</p>
      <p className="small muted mt-3">{admin ? "장애 승인·종료, Skill 승인, 평가, 계정 관리를 수행할 수 있습니다." : "장애 등록·조회와 본인 담당 장애의 후기·예방 대책을 작성할 수 있습니다. 담당자는 AI 분석 후 변경될 수 있습니다."}</p>
      {user.kind === "BOOTSTRAP" ? <div className="banner mt-4">초기 설정용 관리자 토큰으로 접속했습니다. 아래에서 관리자 역할의 개인 계정을 만든 뒤 초대 코드로 활성화하세요. 토큰을 일반 사용자에게 공유하지 마세요.</div> : <form className="form-grid mt-4" onSubmit={e => { e.preventDefault(); action(async () => { await api("/auth/password", "POST", { oldPassword, newPassword }); setOldPassword(""); setNewPassword(""); onPasswordChanged(); }); }}>
        <label>현재 비밀번호<input type="password" autoComplete="current-password" required maxLength={128} value={oldPassword} onChange={e => setOldPassword(e.target.value)} /></label>
        <label>새 비밀번호<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={newPassword} onChange={e => setNewPassword(e.target.value)} /></label>
        <p className="small muted full">12~128자. 변경하면 모든 기기에서 로그아웃되며 새 비밀번호로 다시 로그인해야 합니다.</p>
        <Button disabled={busy}>비밀번호 변경</Button>
      </form>}
    </div></section>
    {admin && <>
      <section className="panel"><div className="panel-body"><h2>계정 초대</h2>
        <p className="small muted mt-3">가상 표시 이름과 담당자를 선택하세요. 1회용 코드는 발급 시에만 표시되며 24시간 후 만료됩니다. 수신자에게 직접 전달하세요. 이메일은 자동 발송하지 않습니다.</p>
        <form className="form-grid mt-4" onSubmit={e => { e.preventDefault(); action(async () => { setInvitation(null); const result = await api("/auth/users", "POST", { login, displayName: name, role, operatorId: operator }); setInvitation({ ...result, login }); setLogin(""); setName(""); setOperator(""); await refresh(); }); }}>
          <label>초대할 아이디<input required pattern={"[A-Za-z0-9][A-Za-z0-9._\\-]{2,59}"} maxLength={60} value={login} onChange={e => setLogin(e.target.value)} placeholder="demo.operator" autoComplete="off" /></label>
          <label>가상 표시 이름<input required maxLength={100} value={name} onChange={e => setName(e.target.value)} placeholder="가상 운영 담당자" /></label>
          <label>계정 역할<select value={role} onChange={e => setRole(e.target.value)}><option value="USER">일반 사용자</option><option value="ADMIN">관리자</option></select></label>
          <label>연결할 가상 담당자<select required value={operator} onChange={e => setOperator(e.target.value)}><option value="">담당자 선택</option>{operators.filter(o => !users.some(u => u.operator_id === o.id)).map(o => <option key={o.id} value={o.id}>{o.name} · {o.department}</option>)}</select></label>
          <Button disabled={busy}>초대 코드 발급</Button>
        </form>
        {invitation && <div className="banner good mt-4" role="status"><strong>초대 코드가 발급되었습니다</strong><p className="mt-2">아이디: {invitation.login}</p><p className="small">로그인 화면 → 초대 활성화 → 아이디·코드·새 비밀번호 입력</p><label className="mt-3">1회용 초대 코드<input readOnly value={invitation.inviteCode} autoComplete="off" onFocus={e => e.target.select()} /></label><p className="small mt-2">만료: {new Date(invitation.expiresAt).toLocaleString("ko-KR")}</p><Button size="sm" variant="outline" className="mt-3" onClick={() => setInvitation(null)}>코드 표시 닫기</Button></div>}
      </div></section>
      <section className="panel"><div className="panel-body"><h2>등록 계정 · {users.length}명</h2>
        {confirm && <div className="banner mt-4" role="alert"><strong>{confirm.login} · {confirm.action === "invite" ? "초대 재발급" : confirm.enabled ? "계정 비활성화" : "계정 활성화"}</strong><p className="small mt-2">{confirm.action === "invite" ? "기존 비밀번호·초대 코드·모든 로그인 세션이 폐기됩니다. 새 코드를 전달해 비밀번호를 다시 설정하도록 하세요." : "계정 상태를 변경하고 기존 로그인 세션을 폐기합니다."}</p><div className="flex-row mt-3"><Button size="sm" disabled={busy} onClick={() => action(async () => { if (confirm.action === "invite") { setInvitation(null); setInvitation({ ...await api(`/auth/users/${confirm.id}/invite`, "POST", {}), login: confirm.login }); } else { await api(`/auth/users/${confirm.id}`, "PATCH", { enabled: !confirm.enabled }); setNotice("계정 상태를 변경하고 기존 세션을 폐기했습니다."); } setConfirm(null); await refresh(); })}>확인 후 적용</Button><Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirm(null)}>취소</Button></div></div>}
        <div className="table-wrap mt-4"><table className="audit-table"><thead><tr><th>계정</th><th>역할·담당자</th><th>상태</th><th>관리</th></tr></thead><tbody>{users.map(u => <tr key={u.id}><td>{u.display_name}<div className="mono small muted">{u.login}</div></td><td>{u.role === "ADMIN" ? "관리자" : "일반 사용자"}<div className="small muted">{u.operator_name}</div></td><td>{!u.enabled ? "비활성" : u.account_status === "PENDING" ? "초대 활성화 대기" : "사용 중"}</td><td><div className="flex-row"><Button size="sm" variant="outline" disabled={busy || !u.enabled || u.id === user.id} onClick={() => setConfirm({ ...u, action: "invite" })}>초대 재발급</Button><Button size="sm" variant="outline" disabled={busy || u.id === user.id} onClick={() => setConfirm({ ...u, action: "state" })}>{u.enabled ? "비활성화" : "활성화"}</Button></div></td></tr>)}</tbody></table></div>
        {!users.length && <p className="muted mt-4">등록된 개인 계정이 없습니다. 첫 관리자 계정을 초대하세요.</p>}
      </div></section>
    </>}
  </div>;
}
