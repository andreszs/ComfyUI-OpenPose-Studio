<h4 align="center">
  <a href="./README.md">English</a> | <a href="./README.de.md">Deutsch</a> | <a href="./README.es.md">Español</a> | <a href="./README.fr.md">Français</a> | Português | <a href="./README.ru.md">Русский</a> | <a href="./README.ja.md">日本語</a> | <a href="./README.ko.md">한국어</a> | <a href="./README.zh.md">中文</a> | <a href="./README.zh-TW.md">繁體中文</a>
</h4>

<p align="center">
  <img alt="Version" src="https://img.shields.io/github/v/tag/andreszs/comfyui-openpose-studio?label=version" />
  <img alt="Last Commit" src="https://img.shields.io/github/last-commit/andreszs/comfyui-openpose-studio" />
  <img alt="License" src="https://img.shields.io/github/license/andreszs/comfyui-openpose-studio" />
</p>
<br />

# OpenPose Studio for ComfyUI 🤸

OpenPose Studio é uma extensão avançada para ComfyUI que permite criar, editar, visualizar e organizar poses OpenPose com uma interface prática e fluida. Ela facilita o ajuste visual de keypoints, o salvamento e carregamento de arquivos de poses, a navegação por presets e galerias de poses, o gerenciamento de coleções, a fusão de múltiplas poses e a exportação de dados JSON limpos para uso com ControlNet e outros workflows guiados por poses.

---

## Índice

- ✨ [Funcionalidades](#funcionalidades)
- 📦 [Instalação](#instalação)
- 🎯 [Uso](#uso)
- 🔧 [Nodes](#nodes)
- ⌨️ [Controles e atalhos do editor](#controles-e-atalhos-do-editor)
- 📋 [Especificações de formato](#especificações-de-formato)
- 🖼️ [Galeria e gerenciamento de poses](#galeria-e-gerenciamento-de-poses)
- 🔀 [Pose Merger](#pose-merger)
- 🖼️ [Referência de fundo](#background-reference)
- ⚠️ [Limitações conhecidas](#limitações-conhecidas)
- 🔍 [Solução de problemas](#solução-de-problemas)
- 🤝 [Contribuindo](#contribuindo)
- 💙 [Financiamento e suporte](#financiamento-e-suporte)
- 📄 [Licença](#licença)

---

## Funcionalidades

✨ **Capacidades principais**
- Edição de keypoints OpenPose em tempo real com feedback visual
- Motor de renderização Canvas nativo moderno (mais rápido, mais suave, menos peças móveis)
- UX de edição interativa: seleção ativa clara + pré-seleção de pose no hover
- Transformações restritas para que keypoints não fujam dos limites do canvas
- Importação/exportação JSON para poses individuais e coleções de poses
- Exportação JSON padrão OpenPose (portátil para outras ferramentas)
- Compatibilidade JSON legacy (pode carregar e editar corretamente JSON não-padrão mais antigos)

✨ **Funcionalidades avançadas**
- **Render Toggles**: Renderizar opcionalmente Body / Hands / Face
- **Pose Gallery**: Navegar e visualizar poses de `poses/`
- **Pose Collections**: Arquivos JSON multi-pose exibidos como poses individualmente selecionáveis
- **Pose Merger**: Combinar múltiplos arquivos JSON em coleções organizadas
- **Quick Cleanup Actions**: Remover keypoints Face e/ou keypoints de Mão esquerda/direita quando presentes
- **Optional Cleanup on Export**: Remover keypoints Face e/ou Hands ao exportar pacotes de poses
- **Background Overlay System**: Modos Contain/Cover selecionáveis com controle de opacidade
- **Undo**: Histórico completo de edição durante a sessão

✨ **Manipulação de dados**
- Descoberta automática de arquivos de pose em `poses/` (incluindo subdiretórios)
- Validação e recuperação de erros para arquivos JSON malformados
- Suporte a poses parciais (subconjunto de keypoints body)
- Coordenadas em espaço de pixel correspondendo aos arquivos de pose para compatibilidade perfeita

✨ **UI e integração**
- Layout totalmente responsivo: adapta-se em tempo real a qualquer tamanho de janela e permanece centralizado
- Escalonamento automático quando o canvas não caberia na tela
- Visuais aprimorados do canvas: grade de fundo + eixos centrais estilizados como no Blender
- Persistência entre reinicializações: modo de visualização da galeria + configurações de overlay de fundo restauradas no lançamento
- Integrações nativas do ComfyUI: toasts + diálogos (com fallback seguro)

---

✨ **Funcionalidades planejadas e roadmap**

> [!IMPORTANT]
> Muitas funcionalidades planejadas dependem de financiamento para tokens de IA. Para o roadmap completo e trabalhos futuros, consulte [TODO.md](../TODO.md)..

Se você tiver uma ideia para uma nova funcionalidade, adoraria ouvi-la — podemos ser capazes de implementá-la rapidamente. Envie feedback, ideias ou sugestões pela página de Issues do repositório: https://github.com/andreszs/comfyui-openpose-studio/issues


## Instalação

### Requisitos
- ComfyUI (build recente)
- Python 3.10+

### Passos

1. Clone este repositório em `ComfyUI/custom_nodes/`.
2. Reinicie o ComfyUI.
3. Confirme que os nodes aparecem em `image > OpenPose Studio`.

---

## Uso

### Workflow básico

1. Adicionar o node **OpenPose Studio** ao seu workflow
2. Clicar no canvas de pré-visualização do node para abrir a UI do editor
3. Selecionar uma pose dos presets ou da galeria para inserir no canvas
4. Ajustar os keypoints arrastando-os no canvas
5. Clicar em **Apply** para renderizar a pose. Isso criará o JSON serializado no node.
6. Conectar a saída `image` aos nodes de imagem subsequentes
7. Conectar a saída `kps` aos nodes compatíveis com ControlNet/OpenPose

### Pré-visualização do editor

![OpenPose Studio UI](../locales/pt/openpose-studio.png)

---

## Nodes

### OpenPose Studio

**Categoria:** `image`

- **Entrada:** `Pose JSON` (STRING) — JSON padrão estilo OpenPose.
- **Opções:**
  - `render body` — incluir body na imagem de pré-visualização/saída renderizada
  - `render hands` — incluir hands na imagem de pré-visualização/saída renderizada (se presentes no JSON)
  - `render face` — incluir face na imagem de pré-visualização/saída renderizada (se presente no JSON)
- **Saídas:**
  - `IMAGE` — Visualização renderizada da pose como imagem RGB (float32, intervalo 0-1)
  - `JSON` — JSON estilo OpenPose com dimensões do canvas e array people contendo dados de keypoints
  - `KPS` — Dados de keypoints no formato POSE_KEYPOINT, compatível com ControlNet
- **UI:** Clicar na pré-visualização do node para abrir o editor interativo. Usar o botão **open editor** (ícone de lápis) para editar a pose diretamente.

#### Captura de tela do node

![OpenPose Studio node](../locales/pt/openpose-studio-node.png)

---

## Controles e atalhos do editor

### Atalhos de teclado

| Controle | Ação |
|---------|--------|
| **Enter** | Aplicar pose e fechar o editor |
| **Escape** | Cancelar e descartar alterações |
| **Ctrl+Z** | Desfazer última ação |
| **Ctrl+Y** | Refazer última ação desfeita |
| **Delete** | Remover keypoint selecionado |

### Interações com o canvas

- **Clique**: Selecionar keypoint
- **Arrastar**: Mover keypoint para nova posição
- **Scroll**: Zoom in/out no canvas (TO-DO)

### Background Reference

Carregar imagens de referência (ex. guias de anatomia, referências fotográficas) como sobreposições não-destrutivas durante a edição de poses. Usar o modo **Contain** para ajustar imagens dentro do canvas ou o modo **Cover** para preencher o canvas. Ajustar a opacidade conforme necessário.

- **Load Image**: Importar imagem de referência do disco
- **Contain/Cover**: Escolher modo de escalonamento
- **Opacity**: Ajustar transparência (0-100%)

> [!NOTE]
> Imagens de fundo persistem durante a sessão do ComfyUI mas **não** são salvas nos workflows.

---

## Especificações de formato

Este editor suporta completamente a edição **OpenPose COCO-18 (body)**.

Também suporta **dados OpenPose face e hands** de maneira *pass-through*: se seu JSON incluir keypoints face e/ou hand, eles são preservados (não removidos) e o node Python pode renderizá-los corretamente. Porém, **a edição de keypoints face e hand ainda não está disponível** (planejada para atualizações futuras).

### Keypoints OpenPose COCO-18 (body)

COCO-18 usa **18 keypoints body**. A pose é armazenada como um array plano chamado `pose_keypoints_2d` com o padrão:

`[x0, y0, c0, x1, y1, c1, ...]`

Onde cada keypoint tem:
- `x`, `y`: coordenadas em pixels no canvas
- `c`: confiança (comumente `0..1`; `0` pode ser usado para pontos "ausentes")

Ordem dos keypoints (índice → nome):

| Índice | Nome |
|------:|------|
| 0 | Nariz |
| 1 | Pescoço |
| 2 | Ombro direito |
| 3 | Cotovelo direito |
| 4 | Pulso direito |
| 5 | Ombro esquerdo |
| 6 | Cotovelo esquerdo |
| 7 | Pulso esquerdo |
| 8 | Quadril direito |
| 9 | Joelho direito |
| 10 | Tornozelo direito |
| 11 | Quadril esquerdo |
| 12 | Joelho esquerdo |
| 13 | Tornozelo esquerdo |
| 14 | Olho direito |
| 15 | Olho esquerdo |
| 16 | Orelha direita |
| 17 | Orelha esquerda |

> [!NOTE]
> **COCO** refere-se à convenção/nomenclatura de dataset *Common Objects in Context* amplamente usada em estimação de pose. "COCO-18" aqui significa o layout body do OpenPose com 18 keypoints.

### Estrutura JSON mínima

Um JSON típico estilo OpenPose para uma pose individual inclui dimensões do canvas e uma entrada `people` com `pose_keypoints_2d`:

```json
{
  "canvas_width": 512,
  "canvas_height": 512,
  "people": [
    {
      "pose_keypoints_2d": [0, 0, 0, 0, 0, 0 /* ... 18 * 3 values total ... */]
    }
  ]
}
```

> [!NOTE]
> O editor pode lidar com poses parciais (alguns keypoints ausentes). Pontos ausentes são tipicamente representados como 0,0,0. Você também pode deletar keypoints distais usando o Pose Editor.

### Leitura adicional

- História e contexto: "What is OpenPose — Exploring a milestone in pose estimation" — um artigo acessível explicando como o OpenPose foi introduzido e seu impacto na estimação de pose: https://www.ultralytics.com/blog/what-is-openpose-exploring-a-milestone-in-pose-estimation

### Formato JSON: Padrão vs Legacy

- **OpenPose Studio:** lê/escreve **JSON padrão estilo OpenPose** e também aceita JSON legacy não-padrão antigo.

Notas práticas:
- Colar JSON padrão no node OpenPose Studio renderiza a pré-visualização imediatamente.

---

## Galeria e gerenciamento de poses

### Visão geral

A aba **Gallery** fornece navegação visual de todas as poses disponíveis com miniaturas de pré-visualização ao vivo. Descobre e organiza poses automaticamente sem configuração manual.

![Pose Gallery](../locales/pt/openpose-studio-gallery.png)

### Modos de visualização

A Gallery suporta três modos de exibição:
- **Large** — pré-visualizações maiores para seleção visual rápida
- **Medium** — tamanho e densidade de pré-visualização equilibrados
- **Tiles** — grade compacta com metadados extras (ex. **tamanho do canvas**, **contagem de keypoints** e outros detalhes da pose)

### Funcionalidades

- **Auto-discovery**: Varre o diretório `poses/` na inicialização
- **Nested organization**: Nomes de subdiretórios tornam-se rótulos de grupo
- **Live preview**: Renderização de miniaturas ao vivo para cada pose
- **Search/filter**: Encontrar poses por nome ou grupo
- **One-click load**: Selecionar uma pose para carregá-la no editor

### Tipos de arquivo suportados

- **Single-pose JSON**: Arquivos JSON OpenPose individuais
- **Pose Collections**: Arquivos JSON multi-pose (cada pose exibida separadamente)
- **Nested directories**: Poses em subdiretórios automaticamente agrupadas

### Comportamento determinístico

Ordenação e descoberta da galeria são totalmente determinísticas:
- Sem embaralhamento aleatório
- Classificação alfabética consistente
- Poses raiz listadas primeiro, depois poses agrupadas
- Recarregamento imediato de todas as poses JSON ao abrir a janela do Editor.

---

## Pose Merger

### Propósito

A aba **Pose Merger** consolida múltiplos arquivos JSON de poses individuais em arquivos de coleção de poses organizados. Isso é útil para:

- Converter grandes bibliotecas de poses em arquivos únicos
- Limpar dados de poses (remover keypoints face/hand)
- Reorganizar e renomear poses
- Distribuir pacotes de poses eficientemente

### Workflow

1. **Add Files**: Carregar arquivos JSON individuais ou de coleção
2. **Preview**: Cada pose exibida com miniatura
3. **Configure**: Opcionalmente excluir componentes face/hand
4. **Export**: Salvar como coleção combinada ou arquivos individuais

### Capacidades principais

| Funcionalidade | Caso de uso |
|---------|----------|
| **Load Multiple Files** | Importação em massa do sistema de arquivos |
| **Component Filtering** | Remover dados desnecessários de face/hand |
| **Collection Expansion** | Extrair poses de coleções existentes |
| **Batch Renaming** | Atribuir nomes significativos durante o export |
| **Selective Export** | Escolher quais poses incluir |

### Opções de saída

- **Combined Collection**: JSON único com todas as poses
- **Individual Files**: Um arquivo por pose (para compatibilidade)

Ambos os formatos de saída são automaticamente detectados pela Gallery e pelo Pose Selector.

---

## Limitações conhecidas

> [!WARNING]
> Nodes 2.0 não está suportado atualmente. Por favor desative Nodes 2.0 por enquanto.

### Limitações atuais e alternativas

1. **Edição de Hand e Face**
  - Problema: Editor atualmente limitado a keypoints body (0-17)
  - Status: Planejado para versão futura
  - Alternativa: Usar Pose Merger para editar manualmente o JSON de hand/face antes de importar

2. **Consistência de resolução**
  - Problema: Pose Merger não unifica automaticamente a resolução em exports de coleções
  - Status: Requer implementação cuidadosa para evitar recorte
  - Alternativa: Pré-escalar as poses para a resolução alvo antes de importar

3. **Compatibilidade com Nodes 2.0**
  - Problema: O node não se comporta corretamente quando ComfyUI "Nodes 2.0" está habilitado.
  - Status: Correção planejada, mas é um refactoring grande e demorado.
  - Nota: Este projeto é desenvolvido usando agentes de IA pagos. Assim que houver financiamento para comprar tokens de IA adicionais, tenho a intenção de priorizar o suporte ao Nodes 2.0.
  - Alternativa: Desativar Nodes 2.0 por enquanto.

### Recuperação de erros

O plugin inclui tratamento defensivo de erros:
- Arquivos JSON inválidos são ignorados silenciosamente na Gallery
- Erros de renderização retornam imagens em branco em vez de crashar
- Metadados ausentes utilizam padrões seguros
- Keypoints malformados são filtrados durante a renderização

---

## Solução de problemas

### Problemas comuns e soluções

**Poses não aparecem na Gallery**
```
✓ Confirmar que os arquivos existem no diretório poses/
✓ Verificar se o JSON é válido (usar validador JSON online)
✓ Verificar se a extensão do arquivo é .json (diferencia maiúsculas/minúsculas no Linux)
✓ Reiniciar o ComfyUI para acionar a descoberta
✓ Verificar o console do navegador (F12) por mensagens de erro
```

**Importação JSON falha**
```
✓ Validar a estrutura JSON (deve ter "pose_keypoints_2d" ou equivalente)
✓ Garantir que as coordenadas são números válidos, não strings
✓ Confirmar mínimo de 18 keypoints para poses body
✓ Verificar sequências de escape malformadas no JSON
```

**Imagem de saída em branco**
```
✓ Verificar se a pose está selecionada e contém keypoints válidos
✓ Verificar as dimensões do canvas (largura/altura) razoáveis (100-2048px)
✓ Clicar em Apply para renderizar após fazer alterações
✓ Verificar por valores NaN ou infinitos nas coordenadas
```

**Background reference não persiste**
```
✓ Habilitar cookies/armazenamento de terceiros no navegador
✓ Verificar configurações de localStorage do navegador
✓ Tentar modo incógnito para isolar o problema
✓ Limpar cache do navegador e tentar novamente
```

**Node não aparece no ComfyUI**
```
✓ Verificar o local do clone: ComfyUI/custom_nodes/comfyui-openpose-studio
✓ Verificar se __init__.py existe e importa corretamente
✓ Reiniciar o ComfyUI completamente (não apenas recarregar a página)
✓ Verificar o console do ComfyUI por erros de importação
```
---

## Contribuindo

Para diretrizes de contribuição, diretrizes de pull request, detalhes de arquitetura e informações de desenvolvimento, ver [CONTRIBUTING.md](../CONTRIBUTING.md). Se usar um agente de IA para auxiliar no desenvolvimento, certifique-se de que ele leia [AGENTS.md](../AGENTS.md) antes de fazer qualquer alteração no código.

---

## Financiamento e suporte

### Por que seu suporte é importante

Este plugin é desenvolvido e mantido de forma independente, com uso regular de **agentes de IA pagos** para acelerar depuração, testes e melhorias de qualidade de vida. Se você o achar útil, o suporte financeiro ajuda a manter o desenvolvimento avançando constantemente.

Sua contribuição ajuda a:

* Financiar ferramentas de IA para correções mais rápidas e novas funcionalidades
* Cobrir manutenção contínua e trabalho de compatibilidade nas atualizações do ComfyUI
* Prevenir desacelerações no desenvolvimento quando os limites de uso são atingidos

> [!TIP]
> Não pode doar? Uma estrela GitHub ⭐ ainda ajuda muito melhorando a visibilidade e alcançando mais usuários.

### 💙 Apoiar este projeto

<table style="width: 100%; table-layout: fixed;">
  <tr>
    <td align="center" style="width: 33.33%; padding: 20px;">
      <div>
        <h4 style="margin: 8px 0;">Ko-fi</h4>
        <a href="https://ko-fi.com/D1D716OLPM" target="_blank" rel="noopener noreferrer">
          <img src="../assets/badge_kofi.svg" alt="Ko-fi Badge" width="180" />
        </a>
        <p style="margin: 8px 0; font-size: 12px;"><a href="https://ko-fi.com/D1D716OLPM" target="_blank" rel="noopener noreferrer">Pagar um café</a></p>
      </div>
    </td>
    <td align="center" style="width: 33.33%; padding: 20px;">
      <div>
        <h4 style="margin: 8px 0;">PayPal</h4>
        <a href="https://www.paypal.com/ncp/payment/GEEM324PDD9NC" target="_blank" rel="noopener noreferrer">
          <img src="../assets/badge_paypal.svg" alt="PayPal Badge" width="180" />
        </a>
        <p style="margin: 8px 0; font-size: 12px;"><a href="https://www.paypal.com/ncp/payment/GEEM324PDD9NC" target="_blank" rel="noopener noreferrer">Abrir PayPal</a></p>
      </div>
    </td>
    <td align="center" style="width: 33.33%; padding: 20px;">
      <div>
        <h4 style="margin: 8px 0;">USDC (somente Arbitrum ⚠️)</h4>
        <a href="https://arbiscan.io/address/0xe36a336fC6cc9Daae657b4A380dA492AB9601e73" target="_blank" rel="noopener noreferrer">
          <img src="../assets/badge_usdc.svg" alt="USDC Badge" width="180" />
        </a>
        <p style="margin: 8px 0; font-size: 12px;"><a href="#usdc-address">Mostrar endereço</a></p>
      </div>
    </td>
  </tr>
</table>

<details>
  <summary>Prefere escanear? Mostrar QR codes</summary>
  <br />
  <table style="width: 100%; table-layout: fixed;">
    <tr>
      <td align="center" style="width: 33.33%; padding: 12px;">
        <strong>Ko-fi</strong><br />
        <a href="https://ko-fi.com/D1D716OLPM" target="_blank" rel="noopener noreferrer">
          <img src="../assets/qr-kofi.svg" alt="Ko-fi QR Code" width="200" />
        </a>
      </td>
      <td align="center" style="width: 33.33%; padding: 12px;">
        <strong>PayPal</strong><br />
        <a href="https://www.paypal.com/ncp/payment/GEEM324PDD9NC" target="_blank" rel="noopener noreferrer">
          <img src="../assets/qr-paypal.svg" alt="PayPal QR Code" width="200" />
        </a>
      </td>
      <td align="center" style="width: 33.33%; padding: 12px;">
        <strong>USDC (Arbitrum) ⚠️</strong><br />
        <a href="https://arbiscan.io/address/0xe36a336fC6cc9Daae657b4A380dA492AB9601e73" target="_blank" rel="noopener noreferrer">
          <img src="../assets/qr-usdc.svg" alt="USDC (Arbitrum) QR Code" width="200" />
        </a>
      </td>
    </tr>
  </table>
</details>

<a id="usdc-address"></a>
<details>
  <summary>Mostrar endereço USDC</summary>

```text
0xe36a336fC6cc9Daae657b4A380dA492AB9601e73
```

> [!WARNING]
> Enviar USDC somente na Arbitrum One. Transferências enviadas em qualquer outra rede não chegarão e podem ser permanentemente perdidas.
</details>

---

## Licença

Licença MIT — ver o arquivo [LICENSE](../LICENSE) para o texto completo.

**Resumo:**
- ✓ Gratuito para uso comercial
- ✓ Gratuito para uso privado
- ✓ Modificar e distribuir
- ✓ Incluir licença e aviso de copyright

---

## Recursos adicionais

### Projetos relacionados

- [ComfyUI](https://github.com/comfyanonymous/ComfyUI) - Framework principal
- [comfyui_controlnet_aux](https://github.com/Kosinkadink/ComfyUI-Advanced-ControlNet) - Suporte ControlNet
- [OpenPose](https://github.com/CMU-Perceptual-Computing-Lab/openpose) - Detecção de pose original

### Documentação

- [ComfyUI Custom Nodes Guide](https://github.com/comfyanonymous/ComfyUI/blob/main/docs/)
- [OpenPose Models & Keypoints](https://github.com/CMU-Perceptual-Computing-Lab/openpose/blob/master/doc/02_Output.md)
- [Canvas 2D API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API) - Motor de renderização

### Guias de solução de problemas

- [ComfyUI Installation Issues](https://github.com/comfyanonymous/ComfyUI/wiki/Installation)
- [Node Registration & Loading](https://github.com/comfyanonymous/ComfyUI/blob/main/docs/CONTRIBUTING.md)
- [Browser Developer Tools](https://developer.chrome.com/docs/devtools/)

---

**Mantido por:** andreszs  
**Status:** Desenvolvimento ativo
