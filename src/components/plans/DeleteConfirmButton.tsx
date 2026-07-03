import { useRef } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface DeleteConfirmButtonProps {
  action: string;
  itemLabel: string;
}

export function DeleteConfirmButton({ action, itemLabel }: DeleteConfirmButtonProps) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" size="sm">
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {itemLabel}?</AlertDialogTitle>
          <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        {/* AlertDialogAction closes the dialog on click, which can unmount this form before
            the browser's native type="submit" default action fires. Submitting imperatively
            in onClick runs synchronously in the same event, ahead of that unmount. */}
        <form method="POST" action={action} ref={formRef} />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction type="button" variant="destructive" onClick={() => formRef.current?.requestSubmit()}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default DeleteConfirmButton;
