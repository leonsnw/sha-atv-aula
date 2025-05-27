const express = require("express");
const multer = require("multer");
const fs = require("fs");
const crypto = require("crypto");
const { PDFDocument, rgb } = require("pdf-lib");
const path = require("path");

const app = express();
const port = 3000;

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

// Rota para upload e inclusão do hash
app.post("/upload", upload.single("pdfFile"), async (req, res) => {
  try {
    const pdfPath = req.file.path;
    const pdfBuffer = fs.readFileSync(pdfPath);
    const hash = crypto.createHash("sha256").update(pdfBuffer).digest("hex");

    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const newPage = pdfDoc.addPage();
    newPage.drawText(`Hash SHA-256:\n${hash}`, {
      x: 50,
      y: 700,
      size: 14,
      color: rgb(0, 0, 0)
    });

    const finalBytes = await pdfDoc.save();
    const outputFile = `generated/pdf-with-hash-${Date.now()}.pdf`;
    fs.writeFileSync(outputFile, finalBytes);

    res.download(outputFile, "documento_com_hash.pdf");
  } catch (err) {
    console.error(err);
    res.status(500).send("Erro ao processar o PDF.");
  }
});

// Página de verificação
app.get("/verificar", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "verify.html"));
});

// Rota de verificação com input manual do hash
app.post("/verify", upload.single("pdfFile"), async (req, res) => {
  try {
    const inputHash = req.body.hash.trim();
    const pdfPath = req.file.path;
    const pdfBuffer = fs.readFileSync(pdfPath);
    const fullPdf = await PDFDocument.load(pdfBuffer);
    const totalPages = fullPdf.getPageCount();

    if (totalPages < 2) return res.send("Erro: PDF precisa conter uma página adicional com o hash.");

    // Remove a última página (onde está o hash)
    const originalDoc = await PDFDocument.create();
    const copiedPages = await originalDoc.copyPages(fullPdf, [...Array(totalPages - 1).keys()]);
    copiedPages.forEach(p => originalDoc.addPage(p));

    const originalBytes = await originalDoc.save();
    const calculatedHash = crypto.createHash("sha256").update(originalBytes).digest("hex");

    const isValid = calculatedHash === inputHash;

    res.send(`
      <h2>Resultado da Verificação</h2>
      <p><strong>Hash fornecido:</strong> ${inputHash}</p>
      <p><strong>Hash calculado:</strong> ${calculatedHash}</p>
      <p style="color: ${isValid ? 'green' : 'red'}; font-weight: bold">
        ${isValid ? '✅ Documento íntegro' : '❌ Documento foi alterado'}
      </p>
      <a href="/verificar">Voltar</a>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send("Erro ao verificar o PDF.");
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
