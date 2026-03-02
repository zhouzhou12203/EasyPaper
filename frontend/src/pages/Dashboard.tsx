import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Upload, FileText, ArrowRight, Clock, CheckCircle, AlertCircle, Languages, BookOpen, Trash2, Search, Highlighter, Brain, Link } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import api from "@/lib/api";

const MAX_FILE_SIZE_MB = 50;

interface Task {
    task_id: string;
    filename: string;
    status: "pending" | "processing" | "parsing" | "rewriting" | "rendering" | "highlighting" | "completed" | "failed";
    created_at: string;
    percent?: number;
    message?: string;
    mode?: "translate" | "simplify";
    highlight?: boolean;
}

const Dashboard = () => {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [mode, setMode] = useState<"translate" | "simplify">("translate");
    const [search, setSearch] = useState("");
    const [highlight, setHighlight] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);
    const [dragging, setDragging] = useState(false);
    const [inputMode, setInputMode] = useState<"file" | "url">("file");
    const [pdfUrl, setPdfUrl] = useState("");
    const [urlLoading, setUrlLoading] = useState(false);
    const navigate = useNavigate();
    const abortRef = useRef<AbortController | null>(null);
    const pollIntervalRef = useRef<number>(2000);

    const fetchTasks = useCallback(async () => {
        try {
            abortRef.current?.abort();
            abortRef.current = new AbortController();
            const response = await api.get("/api/tasks", { signal: abortRef.current.signal });
            setTasks(response.data);
        } catch (error: any) {
            if (error.name === "CanceledError") return;
        }
    }, []);

    // Smart polling: fast when tasks are processing, slow when idle
    useEffect(() => {
        fetchTasks();

        const tick = () => {
            const hasActive = tasks.some((t) =>
                ["pending", "processing", "parsing", "rewriting", "rendering", "highlighting"].includes(t.status)
            );
            pollIntervalRef.current = hasActive ? 2000 : 15000;
        };
        tick();

        const id = setInterval(() => {
            tick();
            fetchTasks();
        }, pollIntervalRef.current);

        return () => {
            clearInterval(id);
            abortRef.current?.abort();
        };
    }, [fetchTasks, tasks.length, tasks.map((t) => t.status).join(",")]);

    const validateFile = (file: File): boolean => {
        if (file.type !== "application/pdf") {
            toast.error("Only PDF files are supported.");
            return false;
        }
        if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
            toast.error(`File size exceeds ${MAX_FILE_SIZE_MB}MB limit.`);
            return false;
        }
        return true;
    };

    const uploadFile = async (file: File) => {
        if (!validateFile(file)) return;

        const formData = new FormData();
        formData.append("file", file);
        formData.append("mode", mode);
        formData.append("highlight", String(highlight));

        setUploadProgress(0);
        try {
            await api.post("/api/upload", formData, {
                onUploadProgress: (e) => {
                    if (e.total) {
                        setUploadProgress(Math.round((e.loaded / e.total) * 100));
                    }
                },
            });
            toast.success(`"${file.name}" uploaded successfully.`);
            fetchTasks();
        } catch (error: any) {
            const msg = error.response?.data?.detail || "Upload failed.";
            toast.error(msg);
        } finally {
            setUploadProgress(null);
        }
    };

    const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        e.target.value = "";
        uploadFile(file);
    };

    // Drag & Drop handlers
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(true);
    };
    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
    };
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) uploadFile(file);
    };

    const handleDelete = async (taskId: string) => {
        try {
            await api.delete(`/api/tasks/${taskId}`);
            setTasks((prev) => prev.filter((t) => t.task_id !== taskId));
            toast.success("Task deleted.");
        } catch {
            toast.error("Failed to delete task.");
        }
    };

    const submitUrl = async () => {
        const trimmed = pdfUrl.trim();
        if (!trimmed) {
            toast.error("Please enter a PDF URL.");
            return;
        }
        try {
            new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
        } catch {
            toast.error("Please enter a valid URL.");
            return;
        }
        setUrlLoading(true);
        try {
            await api.post("/api/upload-url", {
                url: trimmed,
                mode,
                highlight,
            });
            toast.success("PDF downloaded — processing started!");
            setPdfUrl("");
            fetchTasks();
        } catch (error: any) {
            const msg = error.response?.data?.detail || "Failed to download PDF from URL.";
            toast.error(msg);
        } finally {
            setUrlLoading(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case "completed": return "text-green-600 bg-green-50 border-green-200";
            case "processing":
            case "parsing":
            case "rewriting":
            case "rendering":
            case "highlighting":
                return "text-blue-600 bg-blue-50 border-blue-200";
            case "failed": return "text-red-600 bg-red-50 border-red-200";
            default: return "text-gray-600 bg-gray-50 border-gray-200";
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case "completed": return <CheckCircle className="h-4 w-4" />;
            case "processing":
            case "parsing":
            case "rewriting":
            case "rendering":
            case "highlighting":
                return <Clock className="h-4 w-4 animate-pulse" />;
            case "failed": return <AlertCircle className="h-4 w-4" />;
            default: return <Clock className="h-4 w-4" />;
        }
    };

    const filteredTasks = search
        ? tasks.filter((t) => t.filename.toLowerCase().includes(search.toLowerCase()))
        : tasks;

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Hero Section with Drop Zone */}
            <section
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                    "relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/5 via-primary/10 to-transparent p-8 md:p-12 text-center border shadow-sm transition-all",
                    dragging
                        ? "border-primary border-dashed border-2 bg-primary/5 scale-[1.01]"
                        : "border-primary/10"
                )}
            >
                <div className="relative z-10 mx-auto max-w-2xl space-y-6">
                    <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
                        EasyPaper
                    </h1>
                    <p className="text-lg text-gray-600">
                        Upload your English academic papers. Translate to Chinese or simplify
                        complex vocabulary — while preserving layout, images, and formulas.
                    </p>

                    {/* Mode Selector */}
                    <div className="flex flex-wrap justify-center gap-3">
                        <button
                            onClick={() => setMode("translate")}
                            className={cn(
                                "flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-all",
                                mode === "translate"
                                    ? "bg-primary text-primary-foreground shadow-md"
                                    : "bg-white/80 text-gray-600 border border-gray-200 hover:bg-gray-50"
                            )}
                        >
                            <Languages className="h-4 w-4" />
                            Translate to Chinese
                        </button>
                        <button
                            onClick={() => setMode("simplify")}
                            className={cn(
                                "flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-all",
                                mode === "simplify"
                                    ? "bg-primary text-primary-foreground shadow-md"
                                    : "bg-white/80 text-gray-600 border border-gray-200 hover:bg-gray-50"
                            )}
                        >
                            <BookOpen className="h-4 w-4" />
                            Simplify English
                        </button>
                        <button
                            onClick={() => setHighlight(!highlight)}
                            className={cn(
                                "flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-all",
                                highlight
                                    ? "bg-amber-500 text-white shadow-md"
                                    : "bg-white/80 text-gray-600 border border-gray-200 hover:bg-gray-50"
                            )}
                        >
                            <Highlighter className="h-4 w-4" />
                            AI Highlights
                        </button>
                    </div>

                    <Tabs
                        value={inputMode}
                        onValueChange={(v) => setInputMode(v as "file" | "url")}
                        className="w-full max-w-lg mx-auto pt-2"
                    >
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="file" className="gap-2">
                                <Upload className="h-4 w-4" />
                                Upload File
                            </TabsTrigger>
                            <TabsTrigger value="url" className="gap-2">
                                <Link className="h-4 w-4" />
                                Paste URL
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="file" className="flex flex-col items-center gap-3 pt-2">
                            {dragging ? (
                                <p className="text-primary font-medium text-lg">Drop PDF here</p>
                            ) : (
                                <Label
                                    htmlFor="file-upload"
                                    className={cn(
                                        "group relative flex cursor-pointer items-center justify-center gap-3 rounded-full bg-primary px-8 py-4 text-lg font-medium text-primary-foreground shadow-lg transition-all hover:bg-primary/90 hover:shadow-xl hover:scale-105 active:scale-95"
                                    )}
                                >
                                    <Upload className="h-5 w-5" />
                                    <span>Upload PDF</span>
                                    <Input
                                        id="file-upload"
                                        type="file"
                                        accept=".pdf"
                                        className="hidden"
                                        onChange={handleUpload}
                                    />
                                </Label>
                            )}
                            <p className="text-xs text-muted-foreground">
                                or drag and drop a PDF here (max {MAX_FILE_SIZE_MB}MB)
                            </p>
                            {uploadProgress !== null && (
                                <div className="w-full max-w-xs space-y-1">
                                    <div className="flex justify-between text-xs text-muted-foreground">
                                        <span>Uploading...</span>
                                        <span>{uploadProgress}%</span>
                                    </div>
                                    <Progress value={uploadProgress} className="h-2" />
                                </div>
                            )}
                        </TabsContent>

                        <TabsContent value="url" className="flex flex-col items-center gap-3 pt-2">
                            <div className="flex gap-2 w-full">
                                <Input
                                    type="url"
                                    placeholder="https://arxiv.org/pdf/2602.09000"
                                    value={pdfUrl}
                                    onChange={(e) => setPdfUrl(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && submitUrl()}
                                    disabled={urlLoading}
                                    className="flex-1"
                                />
                                <Button
                                    onClick={submitUrl}
                                    disabled={urlLoading || !pdfUrl.trim()}
                                    className="shrink-0 gap-2"
                                >
                                    {urlLoading ? (
                                        <>
                                            <Clock className="h-4 w-4 animate-spin" />
                                            Downloading...
                                        </>
                                    ) : (
                                        <>
                                            <ArrowRight className="h-4 w-4" />
                                            Process
                                        </>
                                    )}
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Paste a direct PDF link (arXiv, OpenReview, etc.)
                            </p>
                        </TabsContent>
                    </Tabs>
                </div>

                {/* Decorative background elements */}
                <div className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 h-64 w-64 rounded-full bg-blue-200/30 blur-3xl" />
                <div className="absolute bottom-0 right-0 translate-x-1/2 translate-y-1/2 h-64 w-64 rounded-full bg-purple-200/30 blur-3xl" />
            </section>

            {/* Task List */}
            <section className="space-y-4">
                <div className="flex items-center justify-between gap-4 px-2">
                    <h2 className="text-2xl font-semibold tracking-tight shrink-0">Recent Documents</h2>
                    {tasks.length > 0 && (
                        <div className="relative max-w-xs w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search documents..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9 h-9"
                            />
                        </div>
                    )}
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {filteredTasks.map((task) => (
                        <Card key={task.task_id} className="group relative overflow-hidden transition-all hover:shadow-md border-gray-200/60">
                            <CardHeader className="pb-3">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-500 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                            <FileText className="h-5 w-5" />
                                        </div>
                                        <div className="space-y-1">
                                            <CardTitle className="text-base font-medium leading-none line-clamp-1" title={task.filename}>
                                                {task.filename}
                                            </CardTitle>
                                            <CardDescription className="text-xs flex items-center gap-1.5">
                                                {new Date(task.created_at).toLocaleDateString()}
                                                <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                                                    {task.mode === "simplify" ? "Simplify" : "Translate"}
                                                </span>
                                                {task.highlight && (
                                                    <span className="inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
                                                        Highlighted
                                                    </span>
                                                )}
                                            </CardDescription>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <div className={cn("flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border", getStatusColor(task.status))}>
                                            {getStatusIcon(task.status)}
                                            <span className="capitalize">{task.status}</span>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-600"
                                            onClick={() => handleDelete(task.task_id)}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>

                            <CardContent>
                                <div className="space-y-3">
                                    {["processing", "parsing", "rewriting", "rendering", "highlighting"].includes(task.status) && (
                                        <div className="space-y-1.5">
                                            <div className="flex justify-between text-xs text-muted-foreground">
                                                <span>{task.message || "Processing..."}</span>
                                                <span>{task.percent || 0}%</span>
                                            </div>
                                            <Progress value={task.percent || 0} className="h-1.5" />
                                        </div>
                                    )}

                                    {task.status === "completed" && (
                                        <div className="flex gap-2">
                                            <Button
                                                className="flex-1 gap-2 group-hover:bg-primary group-hover:text-primary-foreground"
                                                variant="outline"
                                                onClick={() => navigate(`/reader/${task.task_id}`)}
                                            >
                                                Read
                                                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                className="shrink-0 text-violet-600 hover:bg-violet-50 hover:text-violet-700 border-violet-200"
                                                title="Extract Knowledge"
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    try {
                                                        await api.post(`/api/knowledge/extract/${task.task_id}`);
                                                        toast.success("Knowledge extraction started!");
                                                    } catch {
                                                        toast.error("Failed to start extraction.");
                                                    }
                                                }}
                                            >
                                                <Brain className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    )}

                                    {task.status === "failed" && (
                                        <p className="text-xs text-red-500">
                                            {task.message || "Processing failed"}
                                        </p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}

                    {filteredTasks.length === 0 && (
                        <div className="col-span-full py-12 text-center text-muted-foreground bg-gray-50/50 rounded-xl border border-dashed">
                            <p>{search ? "No matching documents found." : "No documents yet. Upload one to get started!"}</p>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
};

export default Dashboard;
