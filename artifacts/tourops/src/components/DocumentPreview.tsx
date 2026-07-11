import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink, Download, FileText, Eye } from "lucide-react";

interface DocumentPreviewProps {
  fileUrl: string;
  fileName: string;
  trigger?: React.ReactNode;
}

export function DocumentPreview({ fileUrl, fileName, trigger }: DocumentPreviewProps) {
  // Simple check for file type
  const isImage = fileUrl?.match(/\.(jpg|jpeg|png|gif|webp)$/i) || fileUrl?.includes("image");
  const isPdf = fileUrl?.match(/\.pdf$/i) || fileUrl?.includes("pdf");

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" variant="ghost" title="Preview Document">
            <Eye className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0 overflow-hidden border-none shadow-2xl">
        <DialogHeader className="p-4 bg-white dark:bg-black border-b shrink-0 flex flex-row items-center justify-between space-y-0 pr-12">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <DialogTitle className="text-sm font-semibold truncate">
              {fileName}
            </DialogTitle>
          </div>
          <div className="flex items-center gap-2 mr-2">
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => window.open(fileUrl, "_blank")}>
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              New Tab
            </Button>
            <Button size="sm" variant="secondary" className="h-8 text-xs" asChild>
              <a href={fileUrl} download={fileName}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Download
              </a>
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center overflow-hidden relative">
          {isImage ? (
            <div className="w-full h-full p-4 flex items-center justify-center">
              <img 
                src={fileUrl} 
                alt={fileName} 
                className="max-w-full max-h-full object-contain shadow-2xl rounded-sm transition-transform hover:scale-[1.02] duration-300" 
              />
            </div>
          ) : isPdf ? (
            <iframe 
              src={fileUrl} 
              className="w-full h-full border-0"
              title={fileName}
            />
          ) : (
            <div className="text-center p-12 bg-white dark:bg-zinc-800 rounded-xl shadow-lg border">
              <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="h-10 w-10 text-muted-foreground" />
              </div>
              <h3 className="font-bold text-lg mb-1">Preview not available</h3>
              <p className="text-muted-foreground text-sm mb-6 max-w-[250px] mx-auto">
                We can't preview this file type directly in the browser.
              </p>
              <Button size="sm" onClick={() => window.open(fileUrl, "_blank")}>
                <ExternalLink className="h-4 w-4 mr-2" />
                Open File Externally
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
