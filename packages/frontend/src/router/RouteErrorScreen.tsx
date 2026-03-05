import { useState } from 'react';
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router';
import { ErrorDisplay } from '@/components/errors/ErrorDisplay';
import { formatErrorWithStack, stringifyUnknown } from '@/components/errors/errorFormatting';

export function RouteErrorScreen() {
  const error = useRouteError();
  const navigate = useNavigate();
  const [showDetails, setShowDetails] = useState(false);

  let title = 'Well, this is embarrassing.';
  let message: string | undefined;
  let detail: string | undefined;

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      title = 'Nothing to see here.';
      message = "That page doesn't exist. It may have moved or the link is broken.";
    } else if (error.status === 403) {
      title = "You're not supposed to be here.";
      message = "You don't have permission to view this page.";
    } else {
      message = `Something went wrong on our end (HTTP ${error.status}: ${error.statusText}).`;
    }
    detail = stringifyUnknown(error.data);
  } else if (error instanceof Error) {
    detail = formatErrorWithStack(error);
  } else {
    detail = stringifyUnknown(error);
  }

  return (
    <ErrorDisplay
      title={title}
      message={message}
      detail={detail}
      onGoHome={() => {
        void navigate('/');
      }}
      onReload={() => window.location.reload()}
      showDetails={showDetails}
      onToggleDetails={() => setShowDetails((value) => !value)}
    />
  );
}
