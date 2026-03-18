"use client";

import { useState } from "react";

export default function AdminPage() {
  const [isUpdating, setIsUpdating] = useState(false);
  const [message, setMessage] = useState("");

  const handleUpdate = async () => {
    setIsUpdating(true);
    setMessage("Updating collections...");

    try {
      const response = await fetch("/api/admin/updateCollections", {
        method: "POST",
      });

      const data = await response.json();

      if (response.ok) {
        setMessage("Collections updated successfully!");
      } else {
        setMessage(`Error: ${data.error}`);
      }
    } catch (err) {
      setMessage(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-4xl mb-8">Admin Panel</h1>

      <div className="space-y-4">
        <button
          onClick={handleUpdate}
          disabled={isUpdating}
          className="px-6 py-3 bg-accent1 text-background rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {isUpdating ? "Updating..." : "Update All Collections"}
        </button>
      </div>

      {message && (
        <p className={`mt-4 ${message.startsWith("Error") ? "text-red-600" : "text-green-600"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
