jQuery(function ($) {
    $('.modal').on('submit', 'form[data-async]', function (event) {
        var $form = $(this);
        var $target = $($form.attr('data-target'));
        console.log("Form submission activated");

        $.ajax({
            type: $form.attr('method'),
            url: $form.attr('action'),
            data: $form.serialize(),

            success: function (data, status) {
                console.log("Submit success");
                $.each(target.split("|"), function (i, val) {
                    if (val == "close") {
                        $form.closest(".modal").modal("hide");
                    } else if (val == "event") {
                        $form.trigger("ajax-submit");
                    } else {
                        $(val).html(data);
                    }
                });
            }, 

            error: function (jqXHR, status, error) {
                console.log(status);
            }
        });

        event.preventDefault();
    });
});