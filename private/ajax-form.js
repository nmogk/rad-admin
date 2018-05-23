jQuery(function ($) {
    $('button#submit').click(function () {
        var $form = $('form.refInput');
        console.log("Form submission activated");

        $.ajax({
            type: $form.attr('method'),
            url: $form.attr('action'),
            data: $form.serialize(),

            success: function (data, status) {
                console.log("Submit success");
                $form.closest(".modal").modal("hide");
            }, 

            error: function (jqXHR, status, error) {
                console.log(status);
            }
        });

        event.preventDefault();
    });
});