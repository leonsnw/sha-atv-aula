const express = require("express");
const multer = require("multer");
const fs = require("fs");
const crypto = require("crypto");
const { PDFDocument, rgb } = require("pdf-lib");
const path = require("path");

const app = express();
const port = 3000;

app.use(express.static("public"));

// Configuração do multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

// Upload de PDF e geração do hash
app.post("/upload", upload.single("pdfFile"), async (req, res) => {
  try {
    const pdfPath = req.file.path;
    const pdfBuffer = fs.readFileSync(pdfPath);

    // Gera o hash SHA-256
    const hash = crypto.createHash("sha256").update(pdfBuffer).digest("hex");

    // Cria um novo PDF com página extra
    const originalPdf = await PDFDocument.load(pdfBuffer);
    const newPage = originalPdf.addPage();
    newPage.drawText("HASH SHA-256 do documento:", { x: 50, y: 700, size: 14, color: rgb(0, 0, 0) });
    newPage.drawText(hash, { x: 50, y: 680, size: 12, color: rgb(0, 0, 0) });

    newPage.drawText("Instruções de verificação:", { x: 50, y: 640, size: 14, color: rgb(0, 0, 0) });
    newPage.drawText("- Gere o hash SHA-256 do conteúdo original.", { x: 50, y: 620, size: 12 });
    newPage.drawText("- Compare com o hash acima para validar a integridade.", { x: 50, y: 600, size: 12 });

    const finalPdfBytes = await originalPdf.save();
    const outputFile = `generated/with-hash-${Date.now()}.pdf`;
    fs.writeFileSync(outputFile, finalPdfBytes);

    res.download(outputFile, "documento_com_hash.pdf");
  } catch (err) {
    console.error(err);
    res.status(500).send("Erro ao processar o PDF.");
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});

// Rota de verificação de integridade
app.get("/verificar", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "verify.html"));
});

app.post("/verify", upload.single("pdfFile"), async (req, res) => {
  try {
    const pdfPath = req.file.path;
    const pdfBuffer = fs.readFileSync(pdfPath);
    const fullPdf = await PDFDocument.load(pdfBuffer);

    const totalPages = fullPdf.getPageCount();

    if (totalPages < 2) return res.send("PDF inválido: deve conter uma página de hash.");

    // Separa o PDF sem a última página
    const originalDoc = await PDFDocument.create();
    const copiedPages = await originalDoc.copyPages(fullPdf, [...Array(totalPages - 1).keys()]);
    copiedPages.forEach(p => originalDoc.addPage(p));

    const originalBytes = await originalDoc.save();
    const calculatedHash = crypto.createHash("sha256").update(originalBytes).digest("hex");

    // Extrai o texto da última página
    const lastPage = fullPdf.getPages()[totalPages - 1];
    const textContent = lastPage.getTextContent ? await lastPage.getTextContent() : "";
    const pdfText = lastPage.getText ? lastPage.getText() : "HASH SHA-256"; // fallback

    const pageText = lastPage.getTextContent ? await lastPage.getTextContent() : null;
    const pageHash = pageText
      ? pageText.items.map(i => i.str).join(" ")
      : "hash_indisponível";

    const foundHash = pageHash.match(/[a-f0-9]{64}/i)?.[0] || "";

    if (!foundHash) return res.send("Hash não encontrado na última página.");

    const isValid = calculatedHash === foundHash;

    res.send(`
      <h2>Resultado da Verificação</h2>
      <p><strong>Hash extraído:</strong> ${foundHash}</p>
      <p><strong>Hash calculado:</strong> ${calculatedHash}</p>
      <p style="color: ${isValid ? 'green' : 'red'}; font-weight: bold">
        ${isValid ? '✅ Documento íntegro' : '❌ Documento foi alterado'}
      </p>
      <a href="/">Voltar</a>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send("Erro ao verificar o PDF.");
  }
});
