import { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import Navbar from "../components/Navbar";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";
import { MoreVertical, AlertOctagon } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "../components/ui/dropdown-menu";

export default function Messages() {
  const { user } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [convs, setConvs] = useState([]);
  const [active, setActive] = useState(null); // conversation object
  const [messages, setMessages] = useState([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const scrollRef = useRef(null);

  const loadConvs = async () => {
    setLoadingConvs(true);
    try { const r = await api.get("/conversations"); setConvs(r.data || []); }
    finally { setLoadingConvs(false); }
  };
  useEffect(() => { loadConvs(); }, []);

  // Auto-open a conv passed from a "Message" button
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const peerId = params.get("with");
    if (peerId) {
      api.post(`/conversations/with/${peerId}`).then(r => {
        setActive(r.data);
        nav("/messages", { replace: true });
        loadConvs();
      }).catch(e => toast.error(e.response?.data?.detail || "Failed to start conversation"));
    }
    // eslint-disable-next-line
  }, [location.search]);

  const openConv = async (c) => {
    setActive(c);
    setLoadingMsgs(true);
    try {
      const r = await api.get(`/conversations/${c.id}/messages`);
      setMessages(r.data || []);
      // Reload convs to clear unread badge
      loadConvs();
    } finally { setLoadingMsgs(false); }
  };

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Poll active conversation
  useEffect(() => {
    if (!active) return;
    const id = setInterval(async () => {
      try {
        const r = await api.get(`/conversations/${active.id}/messages`);
        setMessages(r.data || []);
      } catch {}
    }, 5000);
    return () => clearInterval(id);
  }, [active?.id]);

  const send = async () => {
    if (!text.trim() || !active) return;
    try {
      const r = await api.post(`/conversations/${active.id}/messages`, { body: text });
      setMessages(m => [...m, r.data]);
      setText("");
    } catch (e) { toast.error(e.response?.data?.detail || "Failed to send"); }
  };

  const report = async () => {
    if (!active) return;
    try {
      await api.post("/reports", { conversation_id: active.id, reason: "Reported from conversation" });
      toast.success("Reported to admin");
    } catch { toast.error("Failed to report"); }
  };
  const block = async () => {
    if (!active?.peer?.id) return;
    if (!window.confirm("Block this user? They won't be able to message you.")) return;
    try { await api.post(`/settings/block/${active.peer.id}`); toast.success("Blocked"); setActive(null); loadConvs(); }
    catch { toast.error("Failed"); }
  };

  const filtered = convs.filter(c => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (c.peer?.name || "").toLowerCase().includes(s)
        || (c.peer?.org_name || "").toLowerCase().includes(s)
        || (c.last_message || "").toLowerCase().includes(s);
  });

  const searchMsgs = (q) => q ? messages.filter(m => m.body.toLowerCase().includes(q.toLowerCase())) : messages;

  return (
    <div className="min-h-screen bg-warm-gray">
      <Navbar/>
      <div className="max-w-6xl mx-auto md:h-[calc(100vh-140px)] md:my-6 md:px-6 flex flex-col md:flex-row gap-0 md:gap-0">
        {/* Sidebar */}
        <aside className={`md:w-80 bg-white border border-[color:var(--caws-border)] md:rounded-l-md ${active ? "hidden md:flex" : "flex"} flex-col`} data-testid="conversation-list">
          <div className="p-4 border-b border-[color:var(--caws-border)]">
            <h1 className="font-serif text-xl text-navy mb-2">Messages</h1>
            <input type="text" placeholder="Search" value={search} onChange={e => setSearch(e.target.value)}
                   className="w-full text-sm border border-input rounded-md px-3 py-2"
                   data-testid="conv-search-input"/>
          </div>
          <div className="flex-1 overflow-y-auto max-h-[70vh] md:max-h-none">
            {loadingConvs ? (
              <div className="p-4 text-sm text-gray-500">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-sm text-gray-500 text-center" data-testid="conv-empty">
                No conversations yet. Start one from a nonprofit or student profile.
              </div>
            ) : (
              filtered.map(c => (
                <button key={c.id} onClick={() => openConv(c)}
                        className={`w-full text-left p-3 border-b border-[color:var(--caws-border)] hover:bg-warm-muted transition-colors ${active?.id === c.id ? "bg-warm-muted" : ""}`}
                        data-testid={`conv-item-${c.id}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-navy text-sm truncate">
                      {c.peer?.org_name || c.peer?.name || "Unknown"}
                    </div>
                    {c.unread > 0 && (
                      <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] flex items-center justify-center">
                        {c.unread}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 truncate mt-0.5">{c.last_message || "New conversation"}</div>
                  <div className="text-[10px] text-gray-400 mt-1">{c.last_message_at ? new Date(c.last_message_at).toLocaleString() : ""}</div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Conversation */}
        <section className={`flex-1 bg-white border border-[color:var(--caws-border)] md:border-l-0 md:rounded-r-md ${active ? "flex" : "hidden md:flex"} flex-col`} data-testid="conversation-view">
          {!active ? (
            <div className="flex-1 flex items-center justify-center text-gray-500 text-sm" data-testid="conv-select-hint">
              Select a conversation
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-[color:var(--caws-border)] flex items-center justify-between gap-2">
                <button onClick={() => setActive(null)} className="md:hidden text-sm text-teal">← Back</button>
                <div className="font-serif text-lg text-navy truncate" data-testid="conv-peer-name">
                  {active.peer?.org_name || active.peer?.name}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="p-2 hover:bg-warm-muted rounded" data-testid="conv-menu-trigger" aria-label="Conversation options">
                      <MoreVertical size={18}/>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-white">
                    <DropdownMenuItem onClick={report} data-testid="conv-report" className="cursor-pointer">
                      <AlertOctagon size={14} className="mr-2"/> Report
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={block} data-testid="conv-block" className="cursor-pointer text-red-600">
                      Block user
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[60vh] md:max-h-none">
                {loadingMsgs ? (
                  <div className="text-sm text-gray-500 text-center py-6">Loading…</div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-gray-500 text-sm py-8" data-testid="msgs-empty">Start a conversation</div>
                ) : (
                  searchMsgs(search).map(m => {
                    const mine = m.sender_id === user.id;
                    return (
                      <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`} data-testid={`msg-${m.id}`}>
                        <div className={`max-w-[80%] rounded-2xl px-4 py-2 whitespace-pre-wrap break-words ${
                          mine ? "bg-teal text-white rounded-br-sm" : "bg-warm-muted text-navy rounded-bl-sm"
                        }`}>
                          <div className="text-sm">{m.body}</div>
                          <div className={`text-[10px] mt-1 ${mine ? "text-white/70" : "text-gray-500"}`}>
                            {new Date(m.created_at).toLocaleString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="p-3 border-t border-[color:var(--caws-border)] flex gap-2 items-end">
                <Textarea value={text} onChange={e => setText(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                          placeholder="Message… (Shift+Enter for new line)"
                          rows={2} className="resize-none" data-testid="msg-input"/>
                <Button onClick={send} className="bg-teal hover:bg-teal-hover text-white rounded-md" data-testid="msg-send-btn">Send</Button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
