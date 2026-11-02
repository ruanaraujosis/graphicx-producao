import type { Metadata } from "next";
import Link from "next/link";
import { ContactEmail, Fill, LegalDoc, type LegalSection } from "@/components/legal/legal-doc";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: "Como o GraphicX trata dados pessoais, conforme a LGPD (Lei 13.709/2018).",
};

const sections: LegalSection[] = [
  {
    id: "quem-somos",
    title: "Quem somos e o papel de cada um",
    body: (
      <>
        <p>
          O GraphicX é um sistema de gestão para gráficas, operado por{" "}
          <strong>
            <Fill value={LEGAL.operatorName} label="razão social" />
          </strong>
          , inscrita no CNPJ <Fill value={LEGAL.operatorDocument} label="CNPJ" />.
        </p>
        <p>Pela Lei Geral de Proteção de Dados (LGPD), os papéis são:</p>
        <ul>
          <li>
            <strong>Dados dos clientes de cada gráfica</strong> (cadastros, pedidos, artes): a
            gráfica é a <strong>controladora</strong> e decide como usá-los. O GraphicX é o{" "}
            <strong>operador</strong>: trata esses dados só para prestar o serviço, conforme as
            instruções da gráfica e estes documentos.
          </li>
          <li>
            <strong>Dados das contas de acesso</strong> (usuários das gráficas) e da relação
            comercial com a gráfica: o GraphicX é o <strong>controlador</strong>.
          </li>
        </ul>
        <p>
          Se você é cliente de uma gráfica e quer saber o que ela faz com seus dados, fale primeiro
          com a própria gráfica. Nós ajudamos a gráfica a atender o seu pedido.
        </p>
      </>
    ),
  },
  {
    id: "dados",
    title: "Quais dados tratamos",
    body: (
      <ul>
        <li>
          <strong>Contas de usuários:</strong> nome, e-mail ou nome de usuário, perfil de acesso, a
          configuração da verificação em duas etapas e registros de acesso (data, hora e endereço
          IP).
        </li>
        <li>
          <strong>Cadastros feitos pelas gráficas:</strong> clientes (nome, CPF ou CNPJ, e-mail,
          telefone, WhatsApp, endereço e observações), pedidos, pagamentos registrados e arquivos de
          arte e provas.
        </li>
        <li>
          <strong>Link de arte enviado ao cliente:</strong> os arquivos enviados e a aprovação ou
          recusa da prova, com data, hora, endereço IP e navegador, para comprovar a aprovação.
        </li>
        <li>
          <strong>Shopee (só quando a gráfica conecta a loja):</strong> os dados que a Shopee envia
          sobre pedidos e compradores (nome, endereço de entrega e itens), mensagens de chat e
          avaliações.
        </li>
        <li>
          <strong>Registro de alterações:</strong> quem criou, alterou ou excluiu cada registro
          importante, e quando.
        </li>
      </ul>
    ),
  },
  {
    id: "finalidades",
    title: "Para que usamos e com qual base legal",
    body: (
      <ul>
        <li>
          <strong>Prestar o serviço contratado</strong> (pedidos, produção, estoque, financeiro,
          etiquetas e integração com a Shopee): execução de contrato (art. 7º, V, da LGPD) e, para
          os dados dos clientes das gráficas, a base legal definida pela gráfica controladora.
        </li>
        <li>
          <strong>Segurança, prevenção de fraudes e registro de alterações:</strong> legítimo
          interesse (art. 7º, IX).
        </li>
        <li>
          <strong>Guardar registros de acesso por 6 meses:</strong> obrigação legal (Marco Civil da
          Internet, art. 15).
        </li>
        <li>
          <strong>Comprovar a aprovação de uma arte:</strong> exercício regular de direitos (art.
          7º, VI).
        </li>
      </ul>
    ),
  },
  {
    id: "o-que-nao-fazemos",
    title: "O que não fazemos",
    body: (
      <ul>
        <li>Não vendemos nem alugamos dados pessoais.</li>
        <li>Não exibimos publicidade e não usamos os dados para marketing próprio.</li>
        <li>
          Não usamos ferramentas de rastreamento ou análise de terceiros (como pixels de anúncios).
        </li>
        <li>
          Não acessamos os dados operacionais das gráficas, exceto quando a gráfica pede suporte ou
          a lei obriga.
        </li>
      </ul>
    ),
  },
  {
    id: "cookies",
    title: "Cookies",
    body: (
      <>
        <p>
          Usamos só cookies <strong>essenciais</strong>, sem os quais o sistema não funciona. Por
          isso não pedimos consentimento para eles.
        </p>
        <ul>
          <li>
            <strong>Sessão de login:</strong> mantém você conectado com segurança.
          </li>
          <li>
            <strong>Gráfica ativa:</strong> lembra qual gráfica você está usando, se participa de
            mais de uma.
          </li>
          <li>
            <strong>Conexão com a Shopee:</strong> cookie temporário que protege a autorização da
            loja.
          </li>
        </ul>
        <p>
          A preferência de tema (claro ou escuro) fica guardada só no seu navegador. Não usamos
          cookies de publicidade ou de análise.
        </p>
      </>
    ),
  },
  {
    id: "compartilhamento",
    title: "Com quem compartilhamos",
    body: (
      <>
        <p>Os dados são tratados por fornecedores necessários para o funcionamento do sistema:</p>
        <ul>
          <li>
            <strong>Supabase:</strong> banco de dados, autenticação e armazenamento de arquivos, em
            servidores em São Paulo (Brasil).
          </li>
          <li>
            <strong>Vercel:</strong> hospedagem da aplicação, com processamento em São Paulo e rede
            de distribuição global.
          </li>
          <li>
            <strong>Shopee:</strong> somente quando a gráfica conecta a loja, para sincronizar
            pedidos, anúncios, etiquetas e mensagens.
          </li>
        </ul>
        <p>
          Algumas dessas empresas têm sede fora do Brasil. Nesses casos, a transferência
          internacional segue o art. 33 da LGPD, com contratos que exigem nível de proteção
          adequado. Também podemos compartilhar dados por ordem judicial ou exigência legal.
        </p>
      </>
    ),
  },
  {
    id: "seguranca",
    title: "Como protegemos os dados",
    body: (
      <ul>
        <li>Conexões sempre criptografadas (HTTPS) e dados criptografados nos servidores.</li>
        <li>
          Isolamento entre gráficas aplicado no próprio banco de dados: uma gráfica nunca acessa os
          dados de outra.
        </li>
        <li>
          Permissões por perfil, definidas por cada gráfica, e verificação em duas etapas, que a
          gráfica pode exigir por perfil.
        </li>
        <li>Registro de alterações nos dados mais importantes.</li>
        <li>
          Backup diário de cada gráfica, com as {LEGAL.backupCopies} cópias mais recentes guardadas
          em armazenamento privado.
        </li>
      </ul>
    ),
  },
  {
    id: "retencao",
    title: "Por quanto tempo guardamos",
    body: (
      <ul>
        <li>Enquanto a gráfica mantiver o contrato ativo.</li>
        <li>
          Depois do encerramento, a gráfica pode exportar seus dados, e excluímos tudo em até{" "}
          {LEGAL.deletionDays} dias, inclusive os backups.
        </li>
        <li>Registros de acesso: 6 meses, como exige o Marco Civil da Internet.</li>
        <li>Dados que a lei mande guardar por mais tempo, pelo prazo exigido.</li>
      </ul>
    ),
  },
  {
    id: "direitos",
    title: "Seus direitos",
    body: (
      <>
        <p>Pelo art. 18 da LGPD, você pode pedir:</p>
        <ul>
          <li>confirmação de que tratamos seus dados e acesso a eles;</li>
          <li>correção de dados incompletos, inexatos ou desatualizados;</li>
          <li>anonimização, bloqueio ou eliminação de dados desnecessários ou excessivos;</li>
          <li>portabilidade dos dados;</li>
          <li>informação sobre com quem compartilhamos;</li>
          <li>revisão de decisões tomadas só por meios automatizados.</li>
        </ul>
        <p>
          Peça pelo e-mail <ContactEmail />. Respondemos em até 15 dias. Você também pode reclamar à
          Autoridade Nacional de Proteção de Dados (ANPD).
        </p>
      </>
    ),
  },
  {
    id: "incidentes",
    title: "Incidentes de segurança",
    body: (
      <p>
        Se ocorrer um incidente que possa causar risco ou dano relevante, avisamos as gráficas
        afetadas e a ANPD, como manda o art. 48 da LGPD, informando o que aconteceu e as medidas
        tomadas.
      </p>
    ),
  },
  {
    id: "menores",
    title: "Crianças e adolescentes",
    body: (
      <p>
        O GraphicX é uma ferramenta profissional para empresas e não se destina a menores de 18
        anos.
      </p>
    ),
  },
  {
    id: "alteracoes",
    title: "Alterações desta política",
    body: (
      <p>
        Podemos atualizar esta política. A versão e a data ficam no topo da página, e mudanças
        relevantes são avisadas às gráficas com antecedência. Veja também os{" "}
        <Link href="/termos" className="font-medium underline">
          Termos de Uso
        </Link>
        .
      </p>
    ),
  },
  {
    id: "contato",
    title: "Contato e encarregado",
    body: (
      <p>
        Dúvidas sobre privacidade, pedidos de titulares e contato com o encarregado pelo tratamento
        de dados: <ContactEmail />.
      </p>
    ),
  },
];

export default function PrivacidadePage() {
  return (
    <LegalDoc
      title="Política de Privacidade"
      intro={
        <p>
          Esta política explica, em linguagem simples, quais dados pessoais o GraphicX trata, por
          quê, com quem compartilha e como você exerce seus direitos, conforme a Lei 13.709/2018
          (LGPD).
        </p>
      }
      sections={sections}
    />
  );
}
