"use client";

import { useState } from "react";

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [message, setMessage] = useState("");

  const handleUpdate = async () => {
    if (!password.trim()) {
      setMessage("⚠️ Please enter a password");
      return;
    }

    setIsUpdating(true);
    setMessage("Updating collections...");

    try {
      const response = await fetch("/api/admin/updateCollections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: password }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setMessage("✓ Collections updated successfully!");
        setPassword(""); // Clear password after successful update
      } else {
        setMessage(`✗ Error: ${data.error}`);
      }
    } catch (err) {
      setMessage(`✗ Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-4xl mb-8">Admin Panel</h1>
      
      <div className="space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm font-medium mb-2">
            Admin Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isUpdating) {
                handleUpdate();
              }
            }}
            placeholder="Enter admin password"
            className="w-full px-4 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isUpdating}
          />
        </div>
        
        <button
          onClick={handleUpdate}
          disabled={isUpdating}
          className="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isUpdating ? "Updating..." : "Update All Collections"}
        </button>
      </div>
      
      {message && (
        <p className={`mt-4 ${message.startsWith("✓") ? "text-green-600" : message.startsWith("⚠️") ? "text-yellow-600" : "text-red-600"}`}>
          {message}
        </p>
      )}
    </div>
  );
}