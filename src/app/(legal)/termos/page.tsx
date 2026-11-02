import type { Metadata } from "next";
import Link from "next/link";
import { ContactEmail, Fill, LegalDoc, type LegalSection } from "@/components/legal/legal-doc";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Termos de Uso",
  description: "Condições de uso do GraphicX, o sistema de gestão para gráficas.",
};

const sections: LegalSection[] = [
  {
    id: "aceitacao",
    title: "Aceitação",
    body: (
      <p>
        Estes termos regem o uso do GraphicX, operado por{" "}
        <strong>
          <Fill value={LEGAL.operatorName} label="nome do responsável" />
        </strong>
        {LEGAL.operatorDocument && <> (CNPJ {LEGAL.operatorDocument})</>}. Ao contratar ou usar o
        sistema, a gráfica e seus usuários concordam com estes termos e com a{" "}
        <Link href="/privacidade" className="font-medium underline">
          Política de Privacidade
        </Link>
        . Uma proposta ou contrato assinado com a gráfica prevalece sobre estes termos no que for
        diferente.
      </p>
    ),
  },
  {
    id: "servico",
    title: "O serviço",
    body: (
      <p>
        O GraphicX é um sistema online para gráficas gerenciarem pedidos, aprovação de artes,
        produção, estoque, financeiro, etiquetas e expedição, com integração opcional à Shopee. As
        funções podem evoluir: incluímos melhorias e, quando precisarmos retirar algo relevante,
        avisamos com antecedência.
      </p>
    ),
  },
  {
    id: "contas",
    title: "Contas e acesso",
    body: (
      <ul>
        <li>
          Cada gráfica tem um ou mais administradores, que cadastram a equipe e definem as
          permissões de cada perfil.
        </li>
        <li>
          As contas são pessoais. Cada usuário guarda a própria senha e responde pelo que fizer com
          ela.
        </li>
        <li>
          A gráfica deve remover o acesso de quem sair da equipe e nos avisar se suspeitar de uso
          indevido.
        </li>
      </ul>
    ),
  },
  {
    id: "responsabilidades",
    title: "Responsabilidades da gráfica",
    body: (
      <ul>
        <li>
          Cadastrar só dados obtidos de forma lícita e ter base legal para tratar os dados dos seus
          clientes, como controladora na LGPD.
        </li>
        <li>
          Ter os direitos sobre as artes e arquivos que enviar ou receber, e não usar o sistema para
          conteúdo ilegal.
        </li>
        <li>Seguir as regras da Shopee e de outros serviços que conectar ao GraphicX.</li>
        <li>
          Cumprir suas obrigações fiscais. O GraphicX ainda não emite nota fiscal eletrônica; os
          valores do sistema são de gestão e não substituem a escrituração contábil.
        </li>
        <li>
          Não tentar burlar a segurança, acessar dados de outras gráficas nem sobrecarregar o
          sistema.
        </li>
      </ul>
    ),
  },
  {
    id: "dados",
    title: "Dados e proteção de dados",
    body: (
      <ul>
        <li>
          Os dados que a gráfica cadastra pertencem a ela. O GraphicX atua como operador: trata
          esses dados só para prestar o serviço e segue as instruções da gráfica.
        </li>
        <li>
          Usamos fornecedores de infraestrutura listados na Política de Privacidade, com as mesmas
          obrigações de segurança e sigilo.
        </li>
        <li>
          Avisamos a gráfica sobre incidentes de segurança que afetem seus dados e ajudamos a
          atender os pedidos dos titulares.
        </li>
        <li>
          No encerramento, a gráfica pode exportar seus dados. Depois de {LEGAL.deletionDays} dias,
          excluímos tudo, inclusive os backups, salvo o que a lei obrigue a guardar.
        </li>
      </ul>
    ),
  },
  {
    id: "integracoes",
    title: "Integrações de terceiros",
    body: (
      <p>
        A integração com a Shopee depende da disponibilidade e das regras da própria Shopee. Não
        respondemos por mudanças, instabilidades, bloqueios ou decisões da Shopee sobre a loja da
        gráfica, mas trabalhamos para adaptar o sistema quando houver mudanças.
      </p>
    ),
  },
  {
    id: "disponibilidade",
    title: "Disponibilidade e suporte",
    body: (
      <ul>
        <li>
          Buscamos manter o sistema disponível o tempo todo, mas podem ocorrer interrupções por
          manutenção, falhas de fornecedores ou motivos fora do nosso controle.
        </li>
        <li>
          Fazemos backup diário dos dados de cada gráfica. Ainda assim, recomendamos que a gráfica
          guarde cópias dos arquivos de arte importantes.
        </li>
        <li>
          Suporte pelo e-mail <ContactEmail />, em dias úteis. Prazos de atendimento específicos, se
          houver, constam da proposta ou do contrato.
        </li>
      </ul>
    ),
  },
  {
    id: "pagamento",
    title: "Preços, pagamento e reembolso",
    body: (
      <ul>
        <li>Preços, plano e forma de pagamento constam da proposta ou do contrato da gráfica.</li>
        <li>
          A gráfica pode cancelar a qualquer momento, sem multa. O acesso continua até o fim do
          período já pago.
        </li>
        <li>
          <strong>Primeira contratação:</strong> se a gráfica desistir em até 7 dias da primeira
          cobrança, devolvemos o valor integral.
        </li>
        <li>
          <strong>Cobrança indevida ou em duplicidade:</strong> devolvemos o valor cobrado a mais.
        </li>
        <li>
          <strong>Indisponibilidade prolongada por falha nossa:</strong> concedemos crédito ou
          reembolso proporcional ao período sem acesso.
        </li>
        <li>
          Fora desses casos, valores de períodos já iniciados não são reembolsados. Reembolsos são
          feitos pelo mesmo meio de pagamento, em até 30 dias.
        </li>
      </ul>
    ),
  },
  {
    id: "propriedade",
    title: "Propriedade intelectual",
    body: (
      <p>
        O software, a marca GraphicX e o design do sistema pertencem ao operador. A gráfica recebe
        uma licença de uso, pessoal e intransferível, enquanto durar a contratação. Os dados e
        arquivos da gráfica continuam sendo dela.
      </p>
    ),
  },
  {
    id: "responsabilidade",
    title: "Limitação de responsabilidade",
    body: (
      <p>
        Na medida permitida pela lei, não respondemos por lucros cessantes, perda de negócios ou
        danos indiretos. Nossa responsabilidade total fica limitada ao valor pago pela gráfica nos
        12 meses anteriores ao fato. Essa limitação não se aplica a danos causados por dolo ou culpa
        grave, nem afasta direitos que a lei garanta e que não possam ser renunciados.
      </p>
    ),
  },
  {
    id: "encerramento",
    title: "Suspensão e encerramento",
    body: (
      <ul>
        <li>A gráfica pode encerrar a contratação a qualquer momento.</li>
        <li>
          Podemos suspender o acesso em caso de falta de pagamento, uso que viole estes termos ou a
          lei, ou risco à segurança. Sempre que possível, avisamos antes e damos prazo para
          regularizar.
        </li>
      </ul>
    ),
  },
  {
    id: "alteracoes",
    title: "Alterações destes termos",
    body: (
      <p>
        Podemos atualizar estes termos. Mudanças relevantes são avisadas às gráficas com pelo menos
        30 dias de antecedência. Continuar usando o sistema depois disso significa concordar com a
        nova versão.
      </p>
    ),
  },
  {
    id: "foro",
    title: "Lei aplicável e foro",
    body: (
      <p>
        Estes termos seguem as leis do Brasil. Fica eleito o foro da comarca de{" "}
        <Fill value={LEGAL.forumCity} label="cidade/UF" /> para resolver qualquer questão, salvo
        quando a lei garantir à gráfica o foro do próprio domicílio.
      </p>
    ),
  },
];

export default function TermosPage() {
  return (
    <LegalDoc
      title="Termos de Uso"
      intro={
        <p>
          Estas são as regras para usar o GraphicX: o que oferecemos, o que esperamos de cada
          gráfica e como funcionam pagamento, reembolso e encerramento.
        </p>
      }
      sections={sections}
    />
  );
}
