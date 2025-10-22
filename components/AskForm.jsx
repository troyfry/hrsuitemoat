"use client";
import { useState } from "react";

export default function AskForm({
  state,
  onAnswer,
}) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!question) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, state }),
      });
      const data = await res.json();
      onAnswer(data.answer);
    } catch {
      onAnswer("⚠️ Error fetching answer. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="text"
        placeholder={`Ask a compliance question for ${state.toUpperCase()}...`}
        value={question}
        onChange={e => setQuestion(e.target.value)}
        className="border w-full p-3 rounded-md"
      />
      <button
        disabled={loading}
        className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Thinking..." : "Ask"}
      </button>
    </form>
  );
}
