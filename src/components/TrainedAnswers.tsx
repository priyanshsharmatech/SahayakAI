"use client";
import axios from "axios";
import { useEffect, useState } from "react";
import { Pencil, Trash2, Check, X } from "lucide-react";

interface Entry {
  _id: string;
  question: string;
  answer: string;
  updatedAt?: string;
}

export default function TrainedAnswers({
  botId,
  reloadKey = 0,
}: {
  botId: string;
  reloadKey?: number;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`/api/client/knowledge?botId=${botId}`);
        if (alive) setEntries(res.data.entries);
      } catch (e) {
        console.error(e);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, [botId, reloadKey]);

  const startEdit = (e: Entry) => {
    setEditingId(e._id);
    setDraft(e.answer);
  };
  const cancel = () => {
    setEditingId(null);
    setDraft("");
  };
  const save = async (id: string) => {
    try {
      const res = await axios.put(`/api/client/knowledge/${id}`, { answer: draft });
      setEntries((list) => list.map((e) => (e._id === id ? res.data.entry : e)));
      cancel();
    } catch (e) {
      console.error(e);
    }
  };
  const remove = async (id: string) => {
    try {
      await axios.delete(`/api/client/knowledge/${id}`);
      setEntries((list) => list.filter((e) => e._id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  if (loading)
    return <div className="text-sm text-zinc-400 dark:text-zinc-500">Loading…</div>;
  if (!entries.length)
    return (
      <div className="text-sm text-zinc-400 dark:text-zinc-500">
        No trained answers yet. Answer a question from the Overview tab and it
        will appear here.
      </div>
    );

  return (
    <ul className="space-y-3">
      {entries.map((e) => (
        <li
          key={e._id}
          className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4"
        >
          <div className="text-sm font-semibold mb-1">{e.question}</div>
          {editingId === e._id ? (
            <div className="space-y-2">
              <textarea
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 px-3 py-2 text-sm h-24 resize-none outline-none focus:border-black dark:focus:border-zinc-100"
                value={draft}
                onChange={(ev) => setDraft(ev.target.value)}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => save(e._id)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-black text-white dark:bg-white dark:text-zinc-900 flex items-center gap-1 cursor-pointer"
                >
                  <Check size={13} /> Save
                </button>
                <button
                  onClick={cancel}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer flex items-center gap-1"
                >
                  <X size={13} /> Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap">{e.answer}</p>
              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => startEdit(e)}
                  className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white flex items-center gap-1 cursor-pointer"
                >
                  <Pencil size={12} /> Edit
                </button>
                <button
                  onClick={() => remove(e._id)}
                  className="text-xs font-semibold text-red-500 dark:text-red-400 hover:opacity-80 flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
