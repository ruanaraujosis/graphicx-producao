<!-- Cópia de referência do CLAUDE.md do fork https://github.com/ruanaraujosis/leis (acervo de legislação, alheio ao sistema da gráfica). A versão oficial fica no fork. -->

# leis — acervo da legislação brasileira em Markdown

Fork `ruanaraujosis/leis` do original `ctresb/leis` (licença MIT para scripts; textos de lei são
atos oficiais). Para atualizar com o original: **Sync fork** no GitHub.
Repositório **gigante**: ~1,2 milhão de arquivos, ~13 GB no disco, 324 mil commits no histórico
remoto (clone sempre raso, `--depth 1`). Texto informativo — **não substitui o Diário Oficial**.

## Economia de contexto (obrigatório)

- **Nunca** liste, leia ou faça Grep/Glob na raiz inteira nem em `federal/`, `estaduais/`,
  `municipais/`, `reguladores/`, `jurisprudencia/`. Sempre restrinja ao caminho exato
  (esfera → tipo → ano/UF) e limite resultados (`head_limit`).
- Para achar uma norma, monte o caminho pelo padrão abaixo e use Glob no diretório do ano,
  ou Grep só no campo do cabeçalho (`^numero: "10406"`) dentro desse diretório.
- `WORKLOG.md` (190 KB) e `README.md` (19 KB): leia só a seção necessária, nunca inteiros.
- `scripts/dados/` e `municipais/_lotes/` são insumos de auditoria: só abra se a tarefa pedir.

## Onde está cada coisa

```
constituicao.md                               CF/88 vigente (único arquivo sem cabeçalho YAML)
federal/<tipo>/AAAA/*.md                      leis-ordinarias, leis-complementares, leis-delegadas, decretos-lei…
estaduais/UF/<tipo>/                          inclui constituicao/ e emendas-constitucionais/
municipais/UF/<municipio>/                    legislação municipal (cobertura parcial)
reguladores/<orgao>/<tipo>/                   infralegais federais (CONTRAN, ANVISA, RFB, CMN…)
jurisprudencia/<tribunal>/                    súmulas, temas vinculantes, controle concentrado
tratados/                                     tratados internalizados
COBERTURA.md / PROGRESSO.md                   o que existe e o que falta
scripts/                                      baixar_*, converter_*, auditar_*, test_* (196 arquivos)
scripts/comum.py                              vocabulário canônico de `tipo` (CANONICO)
scripts/plano.py                              escopo de tudo que deve existir
```

Cada `.md` tem cabeçalho YAML (sempre: `titulo`, `tipo`, `numero`, `data`, `versao_texto`,
`fonte`, `baixado_em`; quando houver: `uf`, `ementa`, `situacao`, `revogada`, `urn`…) e depois
`# Título` + texto. Lacunas conhecidas: RJ sem dados, MG parado, CE/MA só leis, municipais parciais.

## Ambiente

- Python: `.venv/bin/python -I scripts/<nome>.py` (venv com `pypdf`, `pdfplumber`,
  `markdown-it-py`, `Pillow`; o resto é biblioteca padrão). Sempre com `-I`, como o projeto exige.
- OCR: Tesseract 5 + `scripts/bin/tessdata/por.traineddata` (SHA-256 conferido com o README).
  `scripts/ocr.swift` (Vision) e `textutil` são só macOS — não funcionam no Linux.
- `pdftotext` (poppler) no sistema.
- Testes: `.venv/bin/python -I -m unittest discover -s scripts -p 'test_*.py'`
  (252 testes; 1 erro esperado sem o cache `_fonte/`, que não é versionado).
- `_fonte/`, `_indice/` e logs não vêm no clone (27 GB); os baixadores os recriam e são retomáveis.
- Downloads respeitam limite de taxa por servidor — use `sh scripts/fila.sh <fila>`, nunca
  rode dois baixadores contra o mesmo servidor.

## Recriar o ambiente numa sessão nova

```sh
GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 https://github.com/ruanaraujosis/leis /home/user/leis
cd /home/user/leis
uv venv -p 3.13 .venv && uv pip install -p .venv/bin/python pypdf pdfplumber markdown-it-py pillow
apt-get install -y tesseract-ocr
mkdir -p scripts/bin/tessdata && curl -sSL -o scripts/bin/tessdata/por.traineddata \
  https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/main/por.traineddata
sha256sum scripts/bin/tessdata/por.traineddata   # 711de9dbb8052067bd42f16b9119967f30bada80d57e2ef24f65d09f531adb04
```

## Segurança

- O hook `.githooks/pre-commit` (atualiza PROGRESSO.md) **não está ativo** — não configure
  `core.hooksPath` sem pedido explícito.
- Revisão feita: sem segredos nem código malicioso; scripts só acessam sites oficiais
  (planalto.gov.br, in.gov.br, senado, câmaras, tribunais).
