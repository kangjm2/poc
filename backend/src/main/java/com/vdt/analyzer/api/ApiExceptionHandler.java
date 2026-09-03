package com.vdt.analyzer.api;

import com.vdt.analyzer.ingest.ImportService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;
import java.util.NoSuchElementException;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler({NoSuchElementException.class,
            org.springframework.dao.EmptyResultDataAccessException.class})
    public ResponseEntity<Map<String, String>> notFound(Exception e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("error", "not_found", "message", String.valueOf(e.getMessage())));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> badRequest(IllegalArgumentException e) {
        return ResponseEntity.badRequest()
                .body(Map.of("error", "bad_request", "message", String.valueOf(e.getMessage())));
    }

    /**
     * An import somebody stopped.
     *
     * 409, not 400 and not 500: the request was well formed and the server was carrying it
     * out - the reason it did not finish is that a person asked it to stop, which is a
     * conflict with the state of the resource and not a fault of the caller.
     *
     * `ImportService.ImportStopped` has said "so the API can answer 409, not 400" in a
     * comment since it was written and NO handler existed, so the one path it names
     * answered 500 with a stack trace. Nothing noticed because nothing exercised it: the
     * scenario that claimed to check cancelling cancelled a job id that had never run.
     */
    @ExceptionHandler(ImportService.ImportStopped.class)
    public ResponseEntity<Map<String, String>> stopped(ImportService.ImportStopped e) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", "import_cancelled",
                             "message", String.valueOf(e.getMessage())));
    }
}
