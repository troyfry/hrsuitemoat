export default function AnswerCard({ text }) {
  return (
    <div className="mt-6 border rounded-md p-4 bg-white shadow-sm">
      <p className="whitespace-pre-line">{text}</p>
      <p className="mt-4 text-xs text-gray-400">
        This information is for guidance only and not legal advice.
      </p>
    </div>
  );
}
