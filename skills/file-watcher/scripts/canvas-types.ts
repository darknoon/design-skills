// JSON Canvas Spec 1.0 — https://jsoncanvas.org/spec/1.0/

export type CanvasColor = "1" | "2" | "3" | "4" | "5" | "6" | (string & {});
export type Side = "top" | "right" | "bottom" | "left";
export type End = "none" | "arrow";

interface NodeBase {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: CanvasColor;
}

export interface TextNode extends NodeBase {
  type: "text";
  text: string;
}

export interface FileNode extends NodeBase {
  type: "file";
  file: string;
  subpath?: string;
}

export interface LinkNode extends NodeBase {
  type: "link";
  url: string;
}

export interface GroupNode extends NodeBase {
  type: "group";
  label?: string;
  background?: string;
  backgroundStyle?: "cover" | "ratio" | "repeat";
}

export type CanvasNode = TextNode | FileNode | LinkNode | GroupNode;

export interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide?: Side;
  fromEnd?: End;
  toNode: string;
  toSide?: Side;
  toEnd?: End;
  color?: CanvasColor;
  label?: string;
}

export interface CanvasData {
  nodes?: CanvasNode[];
  edges?: CanvasEdge[];
}
