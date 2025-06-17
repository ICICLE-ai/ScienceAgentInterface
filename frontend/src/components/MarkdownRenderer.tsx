import React from 'react';
import Markdown from 'react-markdown';

interface MarkdownRendererProps {
  content: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  return (
    <Markdown components={{
      h1(props) { return <h1 className="text-xl font-bold mt-4 mb-2">{props.children}</h1> },
      h2(props) { return <h2 className="text-lg font-bold mt-4 mb-2">{props.children}</h2> },
      h3(props) { return <h3 className="text-base font-bold mt-4 mb-2">{props.children}</h3> },
      p(props) { return <p className="mt-2 mb-2">{props.children}</p> },
      li(props) { return <li className="ml-4">{props.children}</li> },
      ul(props) { return <ul className="list-disc ml-4">{props.children}</ul> },
      ol(props) { return <ol className="list-decimal ml-4">{props.children}</ol> },
      a(props) { return <a className="text-primary underline" href={props.href} target="_blank" rel="noreferrer">{props.children}</a> },
      img(props) { return <img className="max-w-full max-h-60" src={props.src} alt={props.alt} /> },
      em(props) { return <em className="italic">{props.children}</em> },
      strong(props) { return <strong className="font-bold">{props.children}</strong> },
    }}>
      {content}
    </Markdown>
  );
};

export default MarkdownRenderer;
