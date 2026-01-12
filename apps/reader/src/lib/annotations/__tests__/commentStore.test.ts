import { LoroList, createLoroRuntime } from "@keepup/lfcc-bridge";
import { beforeEach, describe, expect, it } from "vitest";
import { useCommentStore } from "../commentStore";

describe("commentStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    useCommentStore.getState().disconnect();
    useCommentStore.setState({ comments: {} });
  });

  describe("addComment", () => {
    it("should add a comment to an annotation", () => {
      const annotationId = "anno_123";
      const text = "This is a test comment";

      useCommentStore.getState().addComment(annotationId, text);

      const comments = useCommentStore.getState().getComments(annotationId);
      expect(comments).toHaveLength(1);
      expect(comments[0].text).toBe(text);
      expect(comments[0].annotationId).toBe(annotationId);
      expect(comments[0].author).toBe("You");
    });

    it("should add multiple comments to the same annotation", () => {
      const annotationId = "anno_123";

      useCommentStore.getState().addComment(annotationId, "First comment");
      useCommentStore.getState().addComment(annotationId, "Second comment");

      const comments = useCommentStore.getState().getComments(annotationId);
      expect(comments).toHaveLength(2);
      expect(comments[0].text).toBe("First comment");
      expect(comments[1].text).toBe("Second comment");
    });

    it("should use custom author when provided", () => {
      const annotationId = "anno_123";

      useCommentStore.getState().addComment(annotationId, "Comment", "Alice");

      const comments = useCommentStore.getState().getComments(annotationId);
      expect(comments[0].author).toBe("Alice");
    });

    it("should trim whitespace from comment text", () => {
      const annotationId = "anno_123";

      useCommentStore.getState().addComment(annotationId, "  Trimmed text  ");

      const comments = useCommentStore.getState().getComments(annotationId);
      expect(comments[0].text).toBe("Trimmed text");
    });

    it("should generate unique comment IDs", () => {
      const annotationId = "anno_123";

      useCommentStore.getState().addComment(annotationId, "Comment 1");
      useCommentStore.getState().addComment(annotationId, "Comment 2");

      const comments = useCommentStore.getState().getComments(annotationId);
      expect(comments[0].id).not.toBe(comments[1].id);
    });
  });

  describe("deleteComment", () => {
    it("should delete a specific comment", () => {
      const annotationId = "anno_123";

      useCommentStore.getState().addComment(annotationId, "First");
      useCommentStore.getState().addComment(annotationId, "Second");

      const comments = useCommentStore.getState().getComments(annotationId);
      const firstId = comments[0].id;

      useCommentStore.getState().deleteComment(annotationId, firstId);

      const remaining = useCommentStore.getState().getComments(annotationId);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].text).toBe("Second");
    });

    it("should not affect other annotations", () => {
      const anno1 = "anno_1";
      const anno2 = "anno_2";

      useCommentStore.getState().addComment(anno1, "Comment 1");
      useCommentStore.getState().addComment(anno2, "Comment 2");

      const comment1Id = useCommentStore.getState().getComments(anno1)[0].id;
      useCommentStore.getState().deleteComment(anno1, comment1Id);

      expect(useCommentStore.getState().getComments(anno1)).toHaveLength(0);
      expect(useCommentStore.getState().getComments(anno2)).toHaveLength(1);
    });
  });

  describe("getComments", () => {
    it("should return empty array for unknown annotation", () => {
      const comments = useCommentStore.getState().getComments("unknown_id");
      expect(comments).toEqual([]);
    });
  });

  describe("clearComments", () => {
    it("should clear all comments for an annotation", () => {
      const annotationId = "anno_123";

      useCommentStore.getState().addComment(annotationId, "Comment 1");
      useCommentStore.getState().addComment(annotationId, "Comment 2");

      useCommentStore.getState().clearComments(annotationId);

      const comments = useCommentStore.getState().getComments(annotationId);
      expect(comments).toHaveLength(0);
    });

    it("should not affect other annotations", () => {
      const anno1 = "anno_1";
      const anno2 = "anno_2";

      useCommentStore.getState().addComment(anno1, "Comment 1");
      useCommentStore.getState().addComment(anno2, "Comment 2");

      useCommentStore.getState().clearComments(anno1);

      expect(useCommentStore.getState().getComments(anno1)).toHaveLength(0);
      expect(useCommentStore.getState().getComments(anno2)).toHaveLength(1);
    });
  });

  describe("Loro Integration", () => {
    it("should sync state from Loro runtime on init", () => {
      const runtime = createLoroRuntime();
      const annotationId = "anno_1";
      const docComments = runtime.doc.getMap("comments");
      const list = docComments.getOrCreateContainer(annotationId, new LoroList());

      const remoteComment = {
        id: "c_remote",
        annotationId,
        text: "Remote comment",
        author: "RemoteUser",
        createdAt: Date.now(),
      };
      list.push(remoteComment);
      runtime.doc.commit();

      const store = useCommentStore.getState();
      store.init(runtime);

      const comments = store.getComments(annotationId);
      expect(comments).toHaveLength(1);
      expect(comments[0].id).toBe("c_remote");
      expect(comments[0].text).toBe("Remote comment");
    });

    it("should update state when Loro runtime changes", () => {
      const runtime = createLoroRuntime();
      const annotationId = "anno_1";
      const store = useCommentStore.getState();
      store.init(runtime);

      expect(store.getComments(annotationId)).toHaveLength(0);

      // Add comment to Loro
      const docComments = runtime.doc.getMap("comments");
      const list = docComments.getOrCreateContainer(annotationId, new LoroList());
      list.push({
        id: "c_1",
        annotationId,
        text: "New comment",
        author: "User",
        createdAt: Date.now(),
      });
      runtime.doc.commit();

      // Loro subscription should trigger syncState
      const comments = store.getComments(annotationId);
      expect(comments).toHaveLength(1);
      expect(comments[0].text).toBe("New comment");
    });

    it("should persist additions to Loro runtime", () => {
      const runtime = createLoroRuntime();
      const store = useCommentStore.getState();
      store.init(runtime);

      const annotationId = "anno_1";
      store.addComment(annotationId, "Hello Loro");
      runtime.doc.commit();

      // Check Loro doc directly
      const docComments = runtime.doc.getMap("comments");
      const list = docComments.get(annotationId) as LoroList;
      expect(list).toBeDefined();
      expect(list.length).toBe(1);
      const comment = list.get(0) as Record<string, unknown>;
      expect(comment.text).toBe("Hello Loro");
    });
  });
});
