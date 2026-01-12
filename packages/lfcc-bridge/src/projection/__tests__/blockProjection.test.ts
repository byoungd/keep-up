import { describe, expect, it } from "vitest";
import type { BlockNode } from "../../crdt/crdtSchema";
import { pmSchema } from "../../pm/pmSchema";
import { blockToPmNode, pmNodeToBlock } from "../projection";

describe("Image Projection", () => {
  it("should project Loro image block to ProseMirror image node", () => {
    const block: BlockNode = {
      id: "b_1_1",
      type: "image",
      attrs: JSON.stringify({
        src: "https://example.com/img.png",
        alt: "Test Image",
        title: "A title",
      }),
      children: [],
    };

    const node = blockToPmNode(block, pmSchema);
    expect(node.type.name).toBe("image");
    expect(node.attrs.src).toBe("https://example.com/img.png");
    expect(node.attrs.alt).toBe("Test Image");
    expect(node.attrs.title).toBe("A title");
    expect(node.attrs.block_id).toBe("b_1_1");
  });

  it("should project ProseMirror image node to Loro image block", () => {
    const node = pmSchema.nodes.image.create({
      block_id: "b_1_1",
      src: "https://example.com/img.png",
      alt: "Test Image",
      title: "A title",
    });

    const block = pmNodeToBlock(node);
    expect(block.type).toBe("image");
    const attrs = JSON.parse(block.attrs);
    expect(attrs.src).toBe("https://example.com/img.png");
    expect(attrs.alt).toBe("Test Image");
    expect(attrs.title).toBe("A title");
  });

  it("should handle round-trip projection", () => {
    const originalBlock: BlockNode = {
      id: "b_1_1",
      type: "image",
      attrs: JSON.stringify({ src: "https://example.com/img.png", alt: "Test Image", title: "" }),
      children: [],
    };

    const pmNode = blockToPmNode(originalBlock, pmSchema);
    const roundTripBlock = pmNodeToBlock(pmNode);

    expect(roundTripBlock.type).toBe("image");
    expect(JSON.parse(roundTripBlock.attrs)).toEqual(JSON.parse(originalBlock.attrs));
  });
});

describe("Video Projection", () => {
  it("should project Loro video block to ProseMirror video node", () => {
    const block: BlockNode = {
      id: "b_vid_1",
      type: "video",
      attrs: JSON.stringify({
        src: "https://example.com/video.mp4",
        controls: true,
        title: "Test Video",
      }),
      children: [],
    };

    const node = blockToPmNode(block, pmSchema);
    expect(node.type.name).toBe("video");
    expect(node.attrs.src).toBe("https://example.com/video.mp4");
    expect(node.attrs.controls).toBe(true);
    expect(node.attrs.title).toBe("Test Video");
  });

  it("should project ProseMirror video node to Loro video block", () => {
    const node = pmSchema.nodes.video.create({
      block_id: "b_vid_1",
      src: "https://example.com/video.mp4",
      controls: true,
      title: "Test Video",
    });

    const block = pmNodeToBlock(node);
    expect(block.type).toBe("video");
    const attrs = JSON.parse(block.attrs);
    expect(attrs.src).toBe("https://example.com/video.mp4");
    expect(attrs.controls).toBe(true);
    expect(attrs.title).toBe("Test Video");
  });
});

describe("Table Projection", () => {
  it("should project Loro table cell with attributes", () => {
    const block: BlockNode = {
      id: "b_cell_1",
      type: "table_cell",
      attrs: JSON.stringify({ colspan: 2, rowspan: 3, background: "red" }),
      children: [],
    };

    const node = blockToPmNode(block, pmSchema);
    expect(node.type.name).toBe("table_cell");
    expect(node.attrs.colspan).toBe(2);
    expect(node.attrs.rowspan).toBe(3);
    expect(node.attrs.background).toBe("red");
  });

  it("should project ProseMirror table cell to Loro block", () => {
    const node = pmSchema.nodes.table_cell.create({
      block_id: "b_cell_1",
      colspan: 2,
      rowspan: 3,
      background: "red",
    });

    const block = pmNodeToBlock(node);
    expect(block.type).toBe("table_cell");
    const attrs = JSON.parse(block.attrs);
    expect(attrs.colspan).toBe(2);
    expect(attrs.rowspan).toBe(3);
    expect(attrs.background).toBe("red");
  });
});

describe("Embed Projection", () => {
  it("should project Loro embed block to ProseMirror embed node", () => {
    const block: BlockNode = {
      id: "b_embed_1",
      type: "embed",
      attrs: JSON.stringify({ src: "https://example.com/video", caption: "An embed" }),
      children: [],
    };

    const node = blockToPmNode(block, pmSchema);
    expect(node.type.name).toBe("embed");
    expect(node.attrs.src).toBe("https://example.com/video");
    expect(node.attrs.caption).toBe("An embed");
  });

  it("should project ProseMirror embed node to Loro embed block", () => {
    const node = pmSchema.nodes.embed.create({
      block_id: "b_embed_1",
      src: "https://example.com/video",
      caption: "An embed",
    });

    const block = pmNodeToBlock(node);
    expect(block.type).toBe("embed");
    const attrs = JSON.parse(block.attrs);
    expect(attrs.src).toBe("https://example.com/video");
    expect(attrs.caption).toBe("An embed");
  });
});
