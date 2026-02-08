import UploadForm from "@/components/UploadForm";
import ArticleGrid from "@/components/ArticleGrid";

export default function HomePage() {
  return (
    <main className="min-h-screen">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <h1 className="text-4xl font-bold text-gray-100">
            Foreign Affairs{" "}
            <span className="text-amber-400">Graphic Novels</span>
          </h1>
          <p className="text-gray-400 mt-2">
            Transform Foreign Affairs articles into AI-generated graphic novels
          </p>
        </div>
      </div>

      {/* Upload section */}
      <section className="max-w-6xl mx-auto px-4 py-8">
        <UploadForm />
      </section>

      {/* Divider */}
      <div className="max-w-6xl mx-auto px-4">
        <hr className="border-gray-800" />
      </div>

      {/* Articles grid */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <h2 className="text-2xl font-semibold text-gray-200 mb-6">
          Previous Articles
        </h2>
        <ArticleGrid />
      </section>
    </main>
  );
}
